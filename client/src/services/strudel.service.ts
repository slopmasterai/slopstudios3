import { get, post, del } from '@/lib/api';
import type {
  StrudelPattern,
  StrudelProcess,
  StrudelValidationResult,
  StrudelMetrics,
  HealthStatus,
  PaginatedResult,
  PaginationParams,
} from '@/types';

export interface ExecutePatternResponse {
  processId: string;
  audioUrl?: string;
  output?: string;
  status: string;
}

export const strudelService = {
  /**
   * Validate a Strudel pattern
   */
  async validatePattern(code: string): Promise<StrudelValidationResult> {
    return post<StrudelValidationResult>('/strudel/validate', { code });
  },

  /**
   * Execute a Strudel pattern synchronously
   */
  async executePattern(
    code: string,
    options?: StrudelPattern['options']
  ): Promise<ExecutePatternResponse> {
    return post<ExecutePatternResponse>('/strudel/execute', { code, options });
  },

  /**
   * Execute a Strudel pattern asynchronously
   */
  async executeAsync(
    code: string,
    options?: StrudelPattern['options']
  ): Promise<{ processId: string }> {
    return post<{ processId: string }>('/strudel/execute/async', {
      code,
      options,
    });
  },

  /**
   * Get the status of a specific process
   */
  async getProcessStatus(processId: string): Promise<StrudelProcess> {
    const response = await get<{
      processId: string;
      status: string;
      progress?: number;
      queuePosition?: number;
      code?: string;
      createdAt: string;
      startedAt?: string;
      completedAt?: string;
      result?: {
        audioData?: string;
        audioMetadata?: {
          duration: number;
          sampleRate: number;
          channels: number;
          format: string;
          fileSize: number;
        };
        error?: { code: string; message: string };
      };
    }>(`/strudel/processes/${processId}`);

    // Convert base64 audioData to a blob URL if present
    let audioUrl: string | undefined;
    if (response.result?.audioData) {
      try {
        const base64Data = response.result.audioData;
        console.log('Base64 data length:', base64Data.length);

        // Decode base64 to Uint8Array in chunks to handle large data
        const binaryString = atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        console.log('Decoded bytes length:', bytes.length, 'Expected: ~1764044');

        // Verify WAV header
        const headerView = new DataView(bytes.buffer);
        const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
        const fileSize = headerView.getUint32(4, true) + 8;
        const dataSize = headerView.getUint32(40, true);
        console.log('WAV header - RIFF:', riff, 'FileSize:', fileSize, 'DataSize:', dataSize);

        // Create blob and URL
        const blob = new Blob([bytes], { type: 'audio/wav' });
        console.log('Blob size:', blob.size);
        audioUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.error('Failed to convert audio data to URL:', e);
      }
    }

    return {
      id: response.processId,
      code: response.code ?? '',
      status: response.status as StrudelProcess['status'],
      progress: response.progress ?? 0,
      audioUrl,
      error: response.result?.error?.message,
      startedAt: response.startedAt,
      completedAt: response.completedAt,
      createdAt: response.createdAt,
    };
  },

  /**
   * Cancel a running process
   */
  async cancelProcess(processId: string): Promise<{ message: string }> {
    return del<{ message: string }>(`/strudel/processes/${processId}`);
  },

  /**
   * List all processes with pagination
   */
  async listProcesses(
    params?: PaginationParams & { status?: string }
  ): Promise<PaginatedResult<StrudelProcess>> {
    return get<PaginatedResult<StrudelProcess>>('/strudel/processes', params);
  },

  /**
   * Get Strudel service metrics
   */
  async getMetrics(): Promise<StrudelMetrics> {
    return get<StrudelMetrics>('/strudel/metrics');
  },

  /**
   * Get Strudel service health status
   */
  async getHealth(): Promise<HealthStatus> {
    return get<HealthStatus>('/strudel/health');
  },

  /**
   * Get pattern history
   */
  async getHistory(
    params?: PaginationParams
  ): Promise<PaginatedResult<StrudelProcess>> {
    return get<PaginatedResult<StrudelProcess>>('/strudel/history', params);
  },

  /**
   * Get preset patterns
   */
  async getPresets(): Promise<{ name: string; code: string; description: string }[]> {
    return get<{ name: string; code: string; description: string }[]>(
      '/strudel/presets'
    );
  },
};

export default strudelService;
