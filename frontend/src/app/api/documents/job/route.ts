import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest/client';

// In-memory storage for document job status
// In production, use Redis or a database
const jobStorage = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  documentId?: string;
  fileName?: string;
  message?: string;
  result?: any;
  error?: string;
  timestamp: number;
}>();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { documentId, fileName, filePath } = body;

    if (!documentId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields: documentId, fileName' },
        { status: 400 }
      );
    }

    // Generate unique job ID
    const jobId = `doc_${documentId}_${Date.now()}`;

    // Store initial job status
    jobStorage.set(jobId, {
      status: 'pending',
      documentId,
      fileName,
      message: 'Document upload queued for processing',
      timestamp: Date.now(),
    });

    // Send event to Inngest for background processing
    await inngest.send({
      name: 'document/uploaded',
      data: {
        jobId,
        documentId,
        fileName,
        filePath,
      },
    });

    console.log(`[API] Document job created: ${jobId} for ${fileName}`);

    return NextResponse.json({
      jobId,
      status: 'pending',
      message: 'Document queued for processing',
    });

  } catch (error: any) {
    console.error('[API] Error creating document job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create document job' },
      { status: 500 }
    );
  }
}

// Get job status
export async function GET(req: NextRequest) {
  try {
    const jobId = req.nextUrl.searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing jobId parameter' },
        { status: 400 }
      );
    }

    const job = jobStorage.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(job);

  } catch (error: any) {
    console.error('[API] Error fetching job status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch job status' },
      { status: 500 }
    );
  }
}

// Export job storage for updates from Inngest
export { jobStorage };
