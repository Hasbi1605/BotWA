import { request } from 'undici';
import pino from 'pino';

const logger = pino({ name: 'worker-client' });

interface SummaryRequest {
  group_id: number;
  window: { start: string; end: string };
  mode?: 'normal' | 'roast';
  messages: Array<{
    id: number;
    content: string;
    sender_name: string;
    timestamp: string;
    reply_to: string | null;
    type: string;
  }>;
}

interface SummaryResponse {
  status: string;
  output?: any;
  model_route?: string;
  error?: string;
}

interface PdfAnalyzeRequest {
  document_id: number;
  file_path: string;
  metadata: {
    filename: string;
    page_count: number | null;
  };
}

interface PdfAnalyzeResponse {
  status: string;
  analysis?: any;
  error?: string;
}

interface ScheduleDetectRequest {
  group_id: number;
  messages: Array<{
    id: number;
    content: string;
    sender_name: string;
    timestamp: string;
  }>;
  reference_time: string;
}

interface ScheduleDetectResponse {
  status: string;
  candidates?: Array<{
    title: string;
    date: string | null;
    time: string | null;
    location: string | null;
    ambiguities: string[];
    source_message_ids: number[];
  }>;
  error?: string;
}

export async function callWorkerSummary(req: SummaryRequest, config: any): Promise<SummaryResponse> {
  return callWorker('/api/v1/summary', req, config, 120_000);
}

export async function callWorkerPdfAnalyze(req: PdfAnalyzeRequest, config: any): Promise<PdfAnalyzeResponse> {
  return callWorker('/api/v1/pdf/analyze', req, config, 180_000);
}

export async function callWorkerScheduleDetect(req: ScheduleDetectRequest, config: any): Promise<ScheduleDetectResponse> {
  return callWorker('/api/v1/schedule/detect', req, config, 30_000);
}

async function callWorker<T>(path: string, body: any, config: any, timeoutMs: number): Promise<T> {
  const url = `${config.workerUrl}${path}`;
  const requestId = crypto.randomUUID();

  try {
    const { statusCode, body: responseBody } = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.workerAuthToken}`,
        'X-Request-ID': requestId,
      },
      body: JSON.stringify(body),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });

    const data = await responseBody.json() as T;

    if (statusCode >= 400) {
      const err = new Error(`Worker returned ${statusCode}`) as any;
      err.status = statusCode;
      throw err;
    }

    return data;
  } catch (err: any) {
    logger.error({ err, path, requestId }, 'Worker call failed');
    throw err;
  }
}
