export interface EQ5Band {
  low_db: number;
  low_mid_db: number;
  mid_db: number;
  high_mid_db: number;
  high_db: number;
}

export interface EQ8Band {
  hz_31: number;
  hz_63: number;
  hz_125: number;
  hz_250: number;
  hz_500: number;
  hz_1k: number;
  hz_4k: number;
  hz_12k: number;
}

export interface ExportSettings {
  loop_length_seconds: number;
  bpm: number;
  grid_snap: string;
  format: string;
  sample_rate: number;
  bit_depth: number;
  post_production?: boolean;
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
  gain_left_db?: number;
  gain_right_db?: number;
  kill_low?: boolean;
  kill_mid?: boolean;
  kill_high?: boolean;
  eq_5band: EQ5Band;
  eq_8band?: EQ8Band;
  meter_level: number;
  color: string;
  is_placeholder: boolean;
  implementation_status: string;
}

export type AuditionMode = 'selected_only' | 'parent_minus_selected' | 'full_context';

export interface IsolationSession {
  id: string;
  source_track_id?: string | null;
  source_track_path: string | null;
  parent_stem_path: string | null;
  parent_stem_name: string;
  available_stems?: string[];
  parent_waveform_peaks?: number[];
  parent_duration?: number;
  region_start: number;
  region_end: number;
  bpm: number;
  key: string | null;
  substems: Substem[];
  selected_substem_ids: string[];
  active_eq_target: string | null;
  eq_target_ids?: string[];
  master_eq_8band?: EQ8Band;
  master_gain_left_db?: number;
  master_gain_right_db?: number;
  master_kill_low?: boolean;
  master_kill_mid?: boolean;
  master_kill_high?: boolean;
  post_production?: boolean;
  audition_mode: AuditionMode;
  export_settings: ExportSettings;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionRequest {
  source_track_id?: string;
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
  gain_left_db?: number;
  gain_right_db?: number;
  kill_low?: boolean;
  kill_mid?: boolean;
  kill_high?: boolean;
  eq_5band?: EQ5Band;
  eq_8band?: EQ8Band;
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
