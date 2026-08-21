export interface EQ5Band {
  low_db: number;
  low_mid_db: number;
  mid_db: number;
  high_mid_db: number;
  high_db: number;
}

export interface ExportSettings {
  loop_length_seconds: number;
  bpm: number;
  grid_snap: string;
  format: string;
  sample_rate: number;
  bit_depth: number;
}

export interface Substem {
  id: string;
  name: string;
  file_path: string | null;
  waveform_peaks: number[];
  selected: boolean;
  solo: boolean;
  muted: boolean;
  gain_db: number;
  eq_5band: EQ5Band;
  meter_level: number;
  color: string;
  is_placeholder: boolean;
  implementation_status: string;
}

export type AuditionMode = 'selected_only' | 'parent_minus_selected' | 'full_context';

export interface IsolationSession {
  id: string;
  source_track_path: string | null;
  parent_stem_path: string | null;
  parent_stem_name: string;
  region_start: number;
  region_end: number;
  bpm: number;
  key: string | null;
  substems: Substem[];
  selected_substem_ids: string[];
  active_eq_target: string | null;
  audition_mode: AuditionMode;
  export_settings: ExportSettings;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  source_track_path?: string;
  parent_stem_path?: string;
  parent_stem_name?: string;
  region_start?: number;
  region_end?: number;
  bpm?: number;
  key?: string;
}

export interface UpdateSubstemRequest {
  selected?: boolean;
  solo?: boolean;
  muted?: boolean;
  gain_db?: number;
  eq_5band?: EQ5Band;
  meter_level?: number;
}

export interface ExportLoopResult {
  session_id: string;
  status: string;
  implementation_status: string;
  selected_substems: string[];
  export_settings: ExportSettings;
  output_path: string | null;
  message: string;
}
