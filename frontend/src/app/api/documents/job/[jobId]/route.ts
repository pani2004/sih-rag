import { NextRequest, NextResponse } from 'next/server';

// Import job storage from parent route
import { jobStorage } from '../route';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await req.json();

    const job = jobStorage.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Update job status
    jobStorage.set(jobId, {
      ...job,
      ...body,
      timestamp: Date.now(),
    });

    console.log(`[API] Job ${jobId} updated:`, body.status);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[API] Error updating job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update job' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const job = jobStorage.get(jobId);

    if (!job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(job);

  } catch (error: any) {
    console.error('[API] Error fetching job:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
