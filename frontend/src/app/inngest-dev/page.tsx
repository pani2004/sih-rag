"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Activity, RefreshCw, AlertCircle, BarChart3 } from "lucide-react";

export default function InngestDevPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const inngestDevUrl = "http://localhost:8288";

  const handleIframeLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setHasError(false);
    // Force iframe reload
    const iframe = document.getElementById("inngest-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur shrink-0">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-br from-blue-500 to-cyan-500 p-2 rounded-lg">
                  <Activity className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">Queue Dev Server</h1>
                  <p className="text-xs text-muted-foreground">
                    Function queue monitoring and flushing Kafka queue with Redis DB
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/metrics">
                <Button variant="outline" size="sm">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Metrics
                </Button>
              </Link>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <a href={inngestDevUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm">
                  Open in New Tab
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Card className="h-full flex flex-col">
            <CardContent className="flex-1 overflow-hidden flex flex-col">
              {hasError && (
                <div className="mb-4 p-4 rounded-lg bg-destructive/15 border border-destructive/50">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">
                        Failed to load Inngest dev server. Make sure it's running with: <code className="bg-muted px-2 py-1 rounded text-xs">npx inngest-cli@latest dev</code>
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {isLoading && !hasError && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-4">
                    <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading Inngest dev server...</p>
                  </div>
                </div>
              )}

              <div className={`flex-1 ${isLoading ? "hidden" : "block"}`}>
                <iframe
                  id="inngest-iframe"
                  src={inngestDevUrl}
                  className="w-full h-full rounded-lg border"
                  onLoad={handleIframeLoad}
                  onError={handleIframeError}
                  title="Inngest Dev Server"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                />
              </div>
            </CardContent>
          </Card>
    </div>
  );
}
