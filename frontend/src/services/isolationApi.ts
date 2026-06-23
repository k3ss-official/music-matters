import api from './api';
import type {
  IsolationSession,
  CreateSessionRequest,
  UpdateSubstemRequest,
  AuditionMode,
  ExportSettings,
  ExportLoopResult,
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
    audition_mode?: AuditionMode;
    export_settings?: Partial<ExportSettings>;
  },
): Promise<IsolationSession> => {
  const resp = await api.patch(`/isolation/session/${sessionId}`, updates);
  return resp.data;
};

export const extractRegion = async (sessionId: string): Promise<unknown> => {
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

export const previewIsolation = async (sessionId: string): Promise<unknown> => {
  const resp = await api.post(`/isolation/session/${sessionId}/preview`);
  return resp.data;
};

export const exportLoop = async (
  sessionId: string,
): Promise<ExportLoopResult> => {
  const resp = await api.post(`/isolation/session/${sessionId}/export-loop`);
  return resp.data;
};
