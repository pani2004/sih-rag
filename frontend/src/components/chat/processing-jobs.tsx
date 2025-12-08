'use client';

import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { FileText, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessingJob {
  jobId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: any;
}

interface ProcessingJobsProps {
  jobs: Map<string, ProcessingJob>;
}

export function ProcessingJobs({ jobs }: ProcessingJobsProps) {
  const activeJobs = Array.from(jobs.values()).filter(
    job => job.status === 'pending' || job.status === 'processing'
  );

  if (activeJobs.length === 0) return null;

  return (
    <div className="space-y-2">
      {activeJobs.map((job) => (
        <ProcessingJobCard key={job.jobId} job={job} />
      ))}
    </div>
  );
}

function ProcessingJobCard({ job }: { job: ProcessingJob }) {
  const getStatusIcon = () => {
    switch (job.status) {
      case 'pending':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'pending':
        return 'bg-blue-500/10 border-blue-500/20';
      case 'processing':
        return 'bg-primary/10 border-primary/20';
      case 'completed':
        return 'bg-green-500/10 border-green-500/20';
      case 'failed':
        return 'bg-destructive/10 border-destructive/20';
    }
  };

  const getProgressColor = () => {
    switch (job.status) {
      case 'pending':
        return 'bg-blue-500';
      case 'processing':
        return 'bg-primary';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-destructive';
    }
  };

  const getStageLabel = () => {
    if (job.progress < 25) return '📤 Uploading...';
    if (job.progress < 40) return '📖 Reading document...';
    if (job.progress < 60) return '✂️ Creating chunks...';
    if (job.progress < 90) return '🧠 Generating embeddings...';
    if (job.progress < 100) return '💾 Storing in database...';
    return '✅ Complete';
  };

  return (
    <div className={cn(
      "p-3 rounded-lg border transition-all duration-300",
      getStatusColor()
    )}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {getStatusIcon()}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                {job.fileName}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {getStageLabel()}
              </p>
            </div>
            <span className="text-xs font-semibold tabular-nums shrink-0">
              {job.progress}%
            </span>
          </div>
          
          <div className="space-y-1.5">
            <Progress 
              value={job.progress} 
              className="h-1.5"
            />
            {job.message && (
              <p className="text-xs text-muted-foreground">
                {job.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
