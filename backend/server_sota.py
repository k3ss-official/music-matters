"""
DJ Sample Discovery - SOTA Flask Backend Server
Enhanced API server with state-of-the-art features
"""
import os
import sys
import logging
from pathlib import Path
from typing import Optional, List
import json

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from config import (
    HOST, PORT, DEBUG, LOG_LEVEL, LOG_FILE,
    DATA_DIR, DOWNLOADS_DIR, SAMPLES_DIR, STEMS_DIR,
    SAMPLE_BAR_OPTIONS, DEMUCS_STEMS
)
from services.metadata_service import get_metadata_service
from services.download_service import get_download_service
from services.audio_analyzer import get_audio_analyzer
from services.sample_extractor import get_sample_extractor
from services.stem_separator import get_stem_manager

# SOTA services
from services.sota_analyzer import get_sota_analyzer
from services.harmonic_mixer import get_harmonic_mixer
from services.audio_fingerprint import get_fingerprint_service, get_semantic_search
from services.daw_exporter import get_daw_exporter, create_crates_from_samples, ExportedTrack, Crate

# Configure logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.urandom(24)
CORS(app, origins=['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'])

# Initialize SocketIO for real-time updates
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

# Initialize services
metadata_service = get_metadata_service()
download_service = get_download_service()
audio_analyzer = get_audio_analyzer()
sample_extractor = get_sample_extractor()
stem_manager = get_stem_manager()

# SOTA services
sota_analyzer = get_sota_analyzer()
harmonic_mixer = get_harmonic_mixer()
fingerprint_service = get_fingerprint_service()
semantic_search = get_semantic_search()
daw_exporter = get_daw_exporter()

# Track library for fingerprinting
fingerprint_library = []


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'version': '2.0.0-SOTA',
        'services': {
            'metadata': True,
            'download': True,
            'analyzer': True,
            'stems': stem_manager.separator.is_available(),
            'sota_analyzer': True,
            'harmonic_mixer': True,
            'fingerprinting': True,
            'daw_export': True
        }
    })


@app.route('/api/info', methods=['GET'])
def get_info():
    """Get application info and configuration"""
    return jsonify({
        'version': '2.0.0-SOTA',
        'data_dir': str(DATA_DIR),
        'downloads_dir': str(DOWNLOADS_DIR),
        'samples_dir': str(SAMPLES_DIR),
        'stems_dir': str(STEMS_DIR),
        'bar_options': SAMPLE_BAR_OPTIONS,
        'stem_info': stem_manager.get_stem_info(),
        'sota_features': {
            'structure_analysis': True,
            'harmonic_mixing': True,
            'fingerprinting': True,
            'mashup_scoring': True,
            'daw_export': ['rekordbox', 'serato', 'm3u', 'json'],
            'semantic_search': True
        }
    })


# ============================================================================
# Artist & Track Search Endpoints (unchanged)
# ============================================================================

@app.route('/api/search/artists', methods=['GET'])
def search_artists():
    """Search for artists"""
    query = request.args.get('q', '')
    if not query:
        return jsonify({'error': 'Query parameter required'}), 400
    
    try:
        artists = metadata_service.search_artist(query)
        return jsonify({
            'query': query,
            'results': [a.to_dict() for a in artists]
        })
    except Exception as e:
        logger.error(f"Artist search error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/search/tracks', methods=['GET'])
def search_tracks():
    """Search for tracks"""
    query = request.args.get('q', '')
    limit = request.args.get('limit', 20, type=int)
    
    if not query:
        return jsonify({'error': 'Query parameter required'}), 400
    
    try:
        tracks = metadata_service.search_tracks(query, limit)
        return jsonify({
            'query': query,
            'results': [t.to_dict() for t in tracks]
        })
    except Exception as e:
        logger.error(f"Track search error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/artist/<artist_name>/tracks', methods=['GET'])
def get_artist_tracks(artist_name: str):
    """Get tracks by an artist with filtering"""
    date_from = request.args.get('date_from')
    date_to = request.args.get('date_to')
    track_types = request.args.getlist('track_type')
    
    if not track_types:
        track_types = None
    
    try:
        tracks = metadata_service.get_artist_tracks(
            artist_name,
            date_from=date_from,
            date_to=date_to,
            track_types=track_types
        )
        return jsonify({
            'artist': artist_name,
            'filters': {
                'date_from': date_from,
                'date_to': date_to,
                'track_types': track_types
            },
            'count': len(tracks),
            'tracks': [t.to_dict() for t in tracks]
        })
    except Exception as e:
        logger.error(f"Get artist tracks error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Download Endpoints (unchanged)
# ============================================================================

@app.route('/api/download', methods=['POST'])
def download_track():
    """Download a track"""
    data = request.json
    artist = data.get('artist', '')
    title = data.get('title', '')
    url = data.get('url')
    
    if not title:
        return jsonify({'error': 'Title is required'}), 400
    
    try:
        result = download_service.download_track(artist, title, url)
        return jsonify(result.to_dict())
    except Exception as e:
        logger.error(f"Download error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# SOTA Analysis Endpoints
# ============================================================================

@app.route('/api/sota/analyze', methods=['POST'])
def sota_analyze():
    """Perform SOTA analysis on an audio file"""
    data = request.json
    file_path = data.get('file_path')
    bar_options = data.get('bar_options', [8, 16, 32])
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        result = sota_analyzer.analyze(path, bar_options)
        
        # Also generate fingerprint
        fingerprint = fingerprint_service.generate_fingerprint(path)
        
        response = result.to_dict()
        response['fingerprint_id'] = fingerprint.id
        
        return jsonify(response)
    except Exception as e:
        logger.error(f"SOTA analysis error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/sota/structure', methods=['POST'])
def get_structure():
    """Get detailed structure analysis"""
    data = request.json
    file_path = data.get('file_path')
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        result = sota_analyzer.analyze(path)
        return jsonify({
            'duration': result.duration,
            'beat_grid': result.beat_grid.to_dict(),
            'segments': [s.to_dict() for s in result.segments],
            'sample_points': [s.to_dict() for s in result.sample_points]
        })
    except Exception as e:
        logger.error(f"Structure analysis error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Harmonic Mixing Endpoints
# ============================================================================

@app.route('/api/harmonic/compatible', methods=['GET'])
def get_compatible_keys():
    """Get harmonically compatible keys for a given key"""
    key = request.args.get('key', '')
    if not key:
        return jsonify({'error': 'key parameter required'}), 400
    
    try:
        compatible = harmonic_mixer.get_compatible_keys(key)
        return jsonify({
            'source_key': key,
            'camelot': harmonic_mixer.get_camelot(key),
            'compatible_keys': compatible
        })
    except Exception as e:
        logger.error(f"Compatible keys error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/harmonic/mix-score', methods=['POST'])
def get_mix_score():
    """Get mix compatibility score between two tracks"""
    data = request.json
    source_key = data.get('source_key', '')
    target_key = data.get('target_key', '')
    source_bpm = data.get('source_bpm', 120)
    target_bpm = data.get('target_bpm', 120)
    
    try:
        result = harmonic_mixer.analyze_mix_compatibility(
            source_key, target_key, source_bpm, target_bpm
        )
        return jsonify(result.to_dict())
    except Exception as e:
        logger.error(f"Mix score error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/harmonic/mashup-score', methods=['POST'])
def get_mashup_score():
    """Calculate mashup potential between two tracks"""
    data = request.json
    track_a = data.get('track_a', {})
    track_b = data.get('track_b', {})
    
    try:
        result = harmonic_mixer.calculate_mashup_score(track_a, track_b)
        return jsonify(result.to_dict())
    except Exception as e:
        logger.error(f"Mashup score error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/harmonic/suggest-order', methods=['POST'])
def suggest_mix_order():
    """Suggest optimal mixing order for a set of tracks"""
    data = request.json
    tracks = data.get('tracks', [])
    
    if not tracks:
        return jsonify({'error': 'tracks array required'}), 400
    
    try:
        ordered = harmonic_mixer.suggest_mix_order(tracks)
        return jsonify({
            'original_count': len(tracks),
            'ordered_tracks': ordered
        })
    except Exception as e:
        logger.error(f"Mix order suggestion error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Fingerprinting & Similarity Endpoints
# ============================================================================

@app.route('/api/fingerprint/generate', methods=['POST'])
def generate_fingerprint():
    """Generate fingerprint for an audio file"""
    data = request.json
    file_path = data.get('file_path')
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        fingerprint = fingerprint_service.generate_fingerprint(path)
        
        # Add to library
        if fingerprint not in fingerprint_library:
            fingerprint_library.append(fingerprint)
        
        return jsonify(fingerprint.to_dict())
    except Exception as e:
        logger.error(f"Fingerprint generation error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/fingerprint/compare', methods=['POST'])
def compare_fingerprints():
    """Compare two audio files for similarity"""
    data = request.json
    file_path_1 = data.get('file_path_1')
    file_path_2 = data.get('file_path_2')
    
    if not file_path_1 or not file_path_2:
        return jsonify({'error': 'Both file paths required'}), 400
    
    try:
        fp1 = fingerprint_service.generate_fingerprint(Path(file_path_1))
        fp2 = fingerprint_service.generate_fingerprint(Path(file_path_2))
        
        result = fingerprint_service.compare_fingerprints(fp1, fp2)
        return jsonify(result.to_dict())
    except Exception as e:
        logger.error(f"Fingerprint comparison error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/fingerprint/find-similar', methods=['POST'])
def find_similar_samples():
    """Find similar samples in library"""
    data = request.json
    file_path = data.get('file_path')
    threshold = data.get('threshold', 0.6)
    max_results = data.get('max_results', 10)
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    try:
        target_fp = fingerprint_service.generate_fingerprint(Path(file_path))
        
        results = fingerprint_service.find_similar(
            target_fp,
            fingerprint_library,
            threshold=threshold,
            max_results=max_results
        )
        
        return jsonify({
            'query_file': file_path,
            'similar_count': len(results),
            'results': [
                {
                    'file_path': fp.file_path,
                    'similarity': sim.to_dict()
                }
                for fp, sim in results
            ]
        })
    except Exception as e:
        logger.error(f"Find similar error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/semantic/describe', methods=['POST'])
def describe_audio():
    """Get semantic description of audio characteristics"""
    data = request.json
    file_path = data.get('file_path')
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        description = semantic_search.describe_audio(path)
        return jsonify({
            'file_path': file_path,
            'description': description
        })
    except Exception as e:
        logger.error(f"Audio description error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# DAW Export Endpoints
# ============================================================================

@app.route('/api/export/rekordbox', methods=['POST'])
def export_rekordbox():
    """Export samples to Rekordbox XML format"""
    data = request.json
    samples = data.get('samples', [])
    grouping = data.get('grouping', 'section')
    output_name = data.get('output_name', 'dj_samples_rekordbox')
    
    if not samples:
        return jsonify({'error': 'samples array required'}), 400
    
    try:
        crates = create_crates_from_samples(samples, grouping)
        output_path = daw_exporter.export_rekordbox_xml(crates, output_name)
        
        return jsonify({
            'success': True,
            'format': 'rekordbox_xml',
            'output_path': str(output_path),
            'crate_count': len(crates),
            'track_count': sum(len(c.tracks) for c in crates)
        })
    except Exception as e:
        logger.error(f"Rekordbox export error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/serato', methods=['POST'])
def export_serato():
    """Export samples to Serato format"""
    data = request.json
    samples = data.get('samples', [])
    grouping = data.get('grouping', 'section')
    output_name = data.get('output_name', 'dj_samples_serato')
    
    if not samples:
        return jsonify({'error': 'samples array required'}), 400
    
    try:
        crates = create_crates_from_samples(samples, grouping)
        output_path = daw_exporter.export_serato_crates(crates, output_name)
        
        return jsonify({
            'success': True,
            'format': 'serato',
            'output_path': str(output_path),
            'crate_count': len(crates)
        })
    except Exception as e:
        logger.error(f"Serato export error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/m3u', methods=['POST'])
def export_m3u():
    """Export samples to M3U playlist"""
    data = request.json
    samples = data.get('samples', [])
    playlist_name = data.get('playlist_name', 'DJ Samples')
    
    if not samples:
        return jsonify({'error': 'samples array required'}), 400
    
    try:
        tracks = [
            ExportedTrack(
                title=s.get('source_track', 'Unknown'),
                artist=s.get('source_artist', 'Unknown'),
                file_path=s.get('file_path', ''),
                bpm=s.get('bpm', 0),
                key=s.get('key', ''),
                duration_seconds=s.get('duration', 0)
            )
            for s in samples
        ]
        
        output_path = daw_exporter.export_m3u_playlist(tracks, playlist_name)
        
        return jsonify({
            'success': True,
            'format': 'm3u8',
            'output_path': str(output_path),
            'track_count': len(tracks)
        })
    except Exception as e:
        logger.error(f"M3U export error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/export/json', methods=['POST'])
def export_json_backup():
    """Export samples to JSON backup"""
    data = request.json
    samples = data.get('samples', [])
    grouping = data.get('grouping', 'section')
    output_name = data.get('output_name', 'dj_samples_backup')
    
    if not samples:
        return jsonify({'error': 'samples array required'}), 400
    
    try:
        crates = create_crates_from_samples(samples, grouping)
        output_path = daw_exporter.export_json_backup(crates, output_name)
        
        return jsonify({
            'success': True,
            'format': 'json',
            'output_path': str(output_path),
            'crate_count': len(crates)
        })
    except Exception as e:
        logger.error(f"JSON export error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Enhanced Sample Extraction Endpoints
# ============================================================================

@app.route('/api/samples/extract-sota', methods=['POST'])
def extract_samples_sota():
    """Extract samples using SOTA analysis"""
    data = request.json
    file_path = data.get('file_path')
    artist = data.get('artist', 'Unknown')
    title = data.get('title', 'Unknown')
    bar_count = data.get('bar_count', 16)
    section_preference = data.get('section_preference')
    extract_stems = data.get('extract_stems', False)
    selected_stems = data.get('selected_stems')
    max_samples = data.get('max_samples', 3)
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        # First run SOTA analysis
        sota_result = sota_analyzer.analyze(path, [bar_count])
        
        # Generate fingerprint
        fingerprint = fingerprint_service.generate_fingerprint(path)
        
        # Extract samples using regular extractor
        samples = sample_extractor.extract_samples(
            path,
            artist,
            title,
            bar_count=bar_count,
            section_preference=section_preference,
            extract_stems=extract_stems,
            selected_stems=selected_stems,
            max_samples=max_samples
        )
        
        # Enrich samples with SOTA data
        enriched_samples = []
        for sample in samples:
            sample_dict = sample.to_dict()
            
            # Add SOTA analysis data
            sample_dict['camelot'] = harmonic_mixer.get_camelot(sample.key)
            sample_dict['compatible_keys'] = harmonic_mixer.get_compatible_keys(sample.key)
            
            # Find matching segment from SOTA analysis
            for seg in sota_result.segments:
                if seg.start_time <= sample.start_time < seg.end_time:
                    sample_dict['segment_details'] = seg.to_dict()
                    break
            
            # Get semantic description
            if Path(sample.file_path).exists():
                sample_dict['description'] = semantic_search.describe_audio(Path(sample.file_path))
            
            enriched_samples.append(sample_dict)
        
        return jsonify({
            'source_file': str(path),
            'sota_analysis': {
                'bpm': sota_result.beat_grid.bpm,
                'key': sota_result.harmonic.key,
                'camelot': sota_result.harmonic.camelot,
                'duration': sota_result.duration,
                'segment_count': len(sota_result.segments),
                'compatible_keys': sota_result.harmonic.compatible_keys
            },
            'fingerprint_id': fingerprint.id,
            'samples': enriched_samples
        })
    except Exception as e:
        logger.error(f"SOTA sample extraction error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Original Endpoints (for backwards compatibility)
# ============================================================================

@app.route('/api/analyze', methods=['POST'])
def analyze_track():
    """Analyze an audio file (legacy endpoint)"""
    data = request.json
    file_path = data.get('file_path')
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        result = audio_analyzer.analyze(path)
        return jsonify(result.to_dict())
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/samples/extract', methods=['POST'])
def extract_samples():
    """Extract samples from a track (legacy endpoint)"""
    data = request.json
    file_path = data.get('file_path')
    artist = data.get('artist', 'Unknown')
    title = data.get('title', 'Unknown')
    bar_count = data.get('bar_count', 16)
    section_preference = data.get('section_preference')
    extract_stems = data.get('extract_stems', False)
    selected_stems = data.get('selected_stems')
    max_samples = data.get('max_samples', 3)
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        samples = sample_extractor.extract_samples(
            path,
            artist,
            title,
            bar_count=bar_count,
            section_preference=section_preference,
            extract_stems=extract_stems,
            selected_stems=selected_stems,
            max_samples=max_samples
        )
        return jsonify({
            'source_file': str(path),
            'samples': [s.to_dict() for s in samples]
        })
    except Exception as e:
        logger.error(f"Sample extraction error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/samples', methods=['GET'])
def list_samples():
    """List all extracted samples"""
    try:
        samples = []
        for file in SAMPLES_DIR.glob('*.wav'):
            samples.append({
                'name': file.stem,
                'path': str(file),
                'size': file.stat().st_size
            })
        return jsonify({'samples': samples})
    except Exception as e:
        logger.error(f"List samples error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/stems/info', methods=['GET'])
def get_stems_info():
    """Get stem separation info"""
    return jsonify(stem_manager.get_stem_info())


@app.route('/api/stems/separate', methods=['POST'])
def separate_stems():
    """Separate a file into stems"""
    data = request.json
    file_path = data.get('file_path')
    selected_stems = data.get('selected_stems')
    
    if not file_path:
        return jsonify({'error': 'file_path is required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        result = stem_manager.get_or_create_stems(path, selected_stems)
        return jsonify(result.to_dict())
    except Exception as e:
        logger.error(f"Stem separation error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/audio/<path:filename>', methods=['GET'])
def serve_audio(filename: str):
    """Serve audio file for playback"""
    for base_dir in [SAMPLES_DIR, DOWNLOADS_DIR, STEMS_DIR]:
        file_path = base_dir / filename
        if file_path.exists():
            return send_file(
                file_path,
                mimetype='audio/wav',
                as_attachment=False
            )
    
    return jsonify({'error': 'File not found'}), 404


@app.route('/api/download-file', methods=['GET'])
def download_file():
    """Download a file to user's specified location"""
    file_path = request.args.get('path')
    
    if not file_path:
        return jsonify({'error': 'path parameter required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    return send_file(
        path,
        as_attachment=True,
        download_name=path.name
    )


# ============================================================================
# WebSocket Events
# ============================================================================

@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')
    emit('connected', {'status': 'ok', 'version': '2.0.0-SOTA'})


@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')


@socketio.on('extract_samples_sota')
def handle_sota_extraction(data):
    """Handle SOTA sample extraction with live progress updates"""
    file_path = data.get('file_path')
    artist = data.get('artist', 'Unknown')
    title = data.get('title', 'Unknown')
    bar_count = data.get('bar_count', 16)
    extract_stems = data.get('extract_stems', False)
    
    try:
        emit('extraction_status', {'status': 'analyzing', 'message': 'Running SOTA analysis...'})
        
        path = Path(file_path)
        sota_result = sota_analyzer.analyze(path, [bar_count])
        
        emit('extraction_status', {
            'status': 'analyzed',
            'message': f'BPM: {sota_result.beat_grid.bpm:.1f}, Key: {sota_result.harmonic.key} ({sota_result.harmonic.camelot})',
            'analysis': {
                'bpm': sota_result.beat_grid.bpm,
                'key': sota_result.harmonic.key,
                'camelot': sota_result.harmonic.camelot,
                'segments': len(sota_result.segments),
                'sample_points': len(sota_result.sample_points)
            }
        })
        
        emit('extraction_status', {'status': 'extracting', 'message': 'Extracting intelligent samples...'})
        
        samples = sample_extractor.extract_samples(
            path, artist, title,
            bar_count=bar_count,
            extract_stems=extract_stems
        )
        
        # Enrich with SOTA data
        enriched = []
        for sample in samples:
            sample_dict = sample.to_dict()
            sample_dict['camelot'] = harmonic_mixer.get_camelot(sample.key)
            enriched.append(sample_dict)
        
        emit('extraction_complete', {
            'status': 'complete',
            'samples': enriched,
            'sota_analysis': sota_result.to_dict()
        })
        
    except Exception as e:
        emit('extraction_error', {'error': str(e)})


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == '__main__':
    logger.info(f"🎯 Starting DJ Sample Discovery SOTA server on {HOST}:{PORT}")
    logger.info(f"📁 Data directory: {DATA_DIR}")
    logger.info("✨ SOTA Features: Structure Analysis, Harmonic Mixing, Fingerprinting, DAW Export")
    
    socketio.run(
        app,
        host=HOST,
        port=PORT,
        debug=DEBUG,
        use_reloader=DEBUG
    )
