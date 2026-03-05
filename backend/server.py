"""
DJ Sample Discovery - Flask Backend Server
Main API server for the application
"""
import os
import sys
import logging
from pathlib import Path
from typing import Optional
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


# ============================================================================
# Health & Info Endpoints
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'services': {
            'metadata': True,
            'download': True,
            'analyzer': True,
            'stems': stem_manager.separator.is_available()
        }
    })


@app.route('/api/info', methods=['GET'])
def get_info():
    """Get application info and configuration"""
    return jsonify({
        'version': '1.0.0',
        'data_dir': str(DATA_DIR),
        'downloads_dir': str(DOWNLOADS_DIR),
        'samples_dir': str(SAMPLES_DIR),
        'stems_dir': str(STEMS_DIR),
        'bar_options': SAMPLE_BAR_OPTIONS,
        'stem_info': stem_manager.get_stem_info()
    })


# ============================================================================
# Artist & Track Search Endpoints
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
# Download Endpoints
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


@socketio.on('download_batch')
def handle_batch_download(data):
    """Handle batch download with progress updates"""
    tracks = data.get('tracks', [])
    
    def progress_callback(current, total, result):
        emit('download_progress', {
            'current': current,
            'total': total,
            'result': result.to_dict()
        })
    
    results = download_service.download_batch(tracks, progress_callback)
    emit('download_complete', {
        'results': [r.to_dict() for r in results]
    })


# ============================================================================
# Analysis Endpoints
# ============================================================================

@app.route('/api/analyze', methods=['POST'])
def analyze_track():
    """Analyze an audio file"""
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


# ============================================================================
# Sample Extraction Endpoints
# ============================================================================

@app.route('/api/samples/extract', methods=['POST'])
def extract_samples():
    """Extract samples from a track"""
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


@app.route('/api/samples/custom', methods=['POST'])
def extract_custom_sample():
    """Extract a custom sample with specific start/end times"""
    data = request.json
    file_path = data.get('file_path')
    start_time = data.get('start_time')
    end_time = data.get('end_time')
    artist = data.get('artist', 'Unknown')
    title = data.get('title', 'Unknown')
    extract_stems = data.get('extract_stems', False)
    
    if not all([file_path, start_time is not None, end_time is not None]):
        return jsonify({'error': 'file_path, start_time, and end_time are required'}), 400
    
    path = Path(file_path)
    if not path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        sample = sample_extractor.extract_custom_sample(
            path,
            float(start_time),
            float(end_time),
            artist,
            title,
            extract_stems=extract_stems
        )
        
        if sample:
            return jsonify(sample.to_dict())
        else:
            return jsonify({'error': 'Failed to extract sample'}), 500
    except Exception as e:
        logger.error(f"Custom sample extraction error: {e}")
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


@app.route('/api/samples/<sample_id>', methods=['DELETE'])
def delete_sample(sample_id: str):
    """Delete a sample"""
    try:
        # Find sample by ID in filename
        for file in SAMPLES_DIR.glob('*.wav'):
            if sample_id in file.stem:
                file.unlink()
                # Also delete any stems
                stem_dir = STEMS_DIR / file.stem
                if stem_dir.exists():
                    import shutil
                    shutil.rmtree(stem_dir)
                return jsonify({'deleted': str(file)})
        
        return jsonify({'error': 'Sample not found'}), 404
    except Exception as e:
        logger.error(f"Delete sample error: {e}")
        return jsonify({'error': str(e)}), 500


# ============================================================================
# Stem Separation Endpoints
# ============================================================================

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


# ============================================================================
# File Serving Endpoints
# ============================================================================

@app.route('/api/audio/<path:filename>', methods=['GET'])
def serve_audio(filename: str):
    """Serve audio file for playback"""
    # Check in multiple directories
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
    emit('connected', {'status': 'ok'})


@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected')


@socketio.on('extract_samples_live')
def handle_live_extraction(data):
    """Handle sample extraction with live progress updates"""
    file_path = data.get('file_path')
    artist = data.get('artist', 'Unknown')
    title = data.get('title', 'Unknown')
    bar_count = data.get('bar_count', 16)
    extract_stems = data.get('extract_stems', False)
    
    try:
        emit('extraction_status', {'status': 'analyzing', 'message': 'Analyzing track...'})
        
        path = Path(file_path)
        analysis = audio_analyzer.analyze(path)
        
        emit('extraction_status', {
            'status': 'analyzed',
            'message': f'BPM: {analysis.bpm}, Key: {analysis.key}',
            'analysis': analysis.to_dict()
        })
        
        emit('extraction_status', {'status': 'extracting', 'message': 'Extracting samples...'})
        
        samples = sample_extractor.extract_samples(
            path, artist, title,
            bar_count=bar_count,
            extract_stems=extract_stems
        )
        
        emit('extraction_complete', {
            'status': 'complete',
            'samples': [s.to_dict() for s in samples]
        })
        
    except Exception as e:
        emit('extraction_error', {'error': str(e)})


# ============================================================================
# Main Entry Point
# ============================================================================

if __name__ == '__main__':
    logger.info(f"Starting DJ Sample Discovery server on {HOST}:{PORT}")
    logger.info(f"Data directory: {DATA_DIR}")
    
    socketio.run(
        app,
        host=HOST,
        port=PORT,
        debug=DEBUG,
        use_reloader=DEBUG
    )
