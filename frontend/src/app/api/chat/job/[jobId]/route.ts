import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for job results (in production, use Redis or similar)
const jobResults = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  response?: string;
  citations?: any[];
  error?: string;
  timestamp: number;
}>();

// Cleanup old results after 1 hour
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of jobResults.entries()) {
    if (now - value.timestamp > 3600000) {
      jobResults.delete(key);
    }
  }
}, 300000); // Check every 5 minutes

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;

    // Check job status in memory (or query your backend/Inngest)
    const result = jobResults.get(jobId);

    if (!result) {
      // Job not found or still pending
      return NextResponse.json({
        status: 'pending',
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error getting job status:', error);
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const body = await request.json();

    // Store job result
    jobResults.set(jobId, {
      ...body,
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating job status:', error);
    return NextResponse.json(
      { error: 'Failed to update job status' },
      { status: 500 }
    );
  }
}
