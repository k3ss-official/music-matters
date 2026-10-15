import api from './api';
import type {
  IsolationSession,
  CreateSessionRequest,
  UpdateSubstemRequest,
  AuditionMode,
  ExportSettings,
  ExportLoopResult,
  EQ8Band,
} from '../types/isolation';

export const createIsolationSession = async (
  payload: CreateSessionRequest,
): Promise<IsolationSession> => {
  const resp = await api.post('/isolation/session', payload);
  return resp.data;
};

export const getIsolationSession = async (
  sessionId: string,
): Promise<IsolationSession> => {
  const resp = await api.get(`/isolation/session/${sessionId}`);
  return resp.data;
};

export const updateIsolationSession = async (
  sessionId: string,
  updates: {
    parent_stem_name?: string;
    region_start?: number;
    region_end?: number;
    bpm?: number;
    key?: string;
    selected_substem_ids?: string[];
    active_eq_target?: string | null;
    eq_target_ids?: string[];
    master_eq_8band?: EQ8Band;
    master_gain_left_db?: number;
    master_gain_right_db?: number;
    master_kill_low?: boolean;
    master_kill_mid?: boolean;
    master_kill_high?: boolean;
    post_production?: boolean;
    audition_mode?: AuditionMode;
    export_settings?: Partial<ExportSettings>;
  },
): Promise<IsolationSession> => {
  const resp = await api.patch(`/isolation/session/${sessionId}`, updates);
  return resp.data;
};

export const isolateElement = async (
  sessionId: string,
  element: string,
  assignToEq = true,
): Promise<IsolationSession> => {
  const resp = await api.post(`/isolation/session/${sessionId}/isolate-element`, {
    element,
    assign_to_eq: assignToEq,
  });
  return resp.data;
};

export const saveCompleteBundle = async (
  sessionId: string,
  payload: {
    label?: string;
    save_isolated_sound?: boolean;
    save_complete_loop?: boolean;
    save_six_stems?: boolean;
    post_production?: boolean;
  },
): Promise<{
  session_id: string;
  status: string;
  post_production: boolean;
  isolated_output_path?: string | null;
  saved_loops: any[];
  total_saved: number;
  message: string;
}> => {
  const resp = await api.post(
    `/isolation/session/${sessionId}/save-complete-bundle`,
    payload,
  );
  return resp.data;
};

export const extractRegion = async (
  sessionId: string,
): Promise<{
  session_id: string;
  status: string;
  implementation_status: string;
  region_start: number;
  region_end: number;
  output_path?: string;
  message: string;
}> => {
  const resp = await api.post(`/isolation/session/${sessionId}/extract-region`);
  return resp.data;
};

export const splitSubstems = async (
  sessionId: string,
): Promise<IsolationSession> => {
  const resp = await api.post(`/isolation/session/${sessionId}/split-substems`);
  return resp.data;
};

export const updateSubstem = async (
  sessionId: string,
  substemId: string,
  updates: UpdateSubstemRequest,
): Promise<IsolationSession> => {
  const resp = await api.patch(
    `/isolation/session/${sessionId}/substem/${substemId}`,
    updates,
  );
  return resp.data;
};

export const previewIsolation = async (
  sessionId: string,
): Promise<{
  session_id: string;
  status: string;
  implementation_status: string;
  output_path?: string;
  message: string;
}> => {
  const resp = await api.post(`/isolation/session/${sessionId}/preview`);
  return resp.data;
};

export const getIsolationAudioUrl = (
  sessionId: string,
  target: 'parent' | 'region' | 'preview' | string,
  cacheBust?: number,
): string => {
  const qs = cacheBust ? `?t=${cacheBust}` : '';
  return `/api/isolation/session/${encodeURIComponent(sessionId)}/audio/${encodeURIComponent(target)}${qs}`;
};

export const exportLoop = async (
  sessionId: string,
): Promise<ExportLoopResult> => {
  const resp = await api.post(`/isolation/session/${sessionId}/export-loop`);
  return resp.data;
};
