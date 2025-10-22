"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Copy, ExternalLink, Download } from "lucide-react";

export default function RecordingsPage() {
  const { data: session } = useSession();
  const [meetingId, setMeetingId] = useState("");
  const [hlsData, setHlsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchHlsUrl = async () => {
    if (!meetingId.trim()) {
      setError("Please enter a meeting ID");
      return;
    }

    setLoading(true);
    setError(null);
    setHlsData(null);

    try {
      const response = await fetch(`/api/recording/hls-url?meetingId=${meetingId}`);
      const data = await response.json();

      if (response.ok) {
        setHlsData(data);
      } else {
        setError(data.error || "Failed to fetch HLS URL");
      }
    } catch (err) {
      setError("Failed to fetch HLS URL");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Sign in to view recordings</h1>
          <a href="/api/auth/signin" className="text-blue-600 hover:underline">
            Sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Meeting Recordings</h1>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Get HLS Streaming URL</h2>
          
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={meetingId}
              onChange={(e) => setMeetingId(e.target.value)}
              placeholder="Enter Meeting ID"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={fetchHlsUrl}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Get URL"}
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
        </div>

        {hlsData && (
          <div className="space-y-6">
            {/* HLS URL */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-3">HLS Streaming URL</h3>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={hlsData.hlsUrl}
                  readOnly
                  className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded text-sm font-mono"
                />
                <button
                  onClick={() => copyToClipboard(hlsData.hlsUrl)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded flex items-center gap-2"
                >
                  <Copy size={16} />
                  Copy
                </button>
              </div>
              <p className="text-sm text-gray-600">Valid for 24 hours</p>
            </div>

            {/* Available Qualities */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-3">Available Qualities</h3>
              <div className="flex gap-2 flex-wrap">
                {hlsData.qualities.map((quality) => (
                  <span
                    key={quality}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                  >
                    {quality}
                  </span>
                ))}
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">How to Play</h3>
              
              <div className="space-y-4">
                {/* VLC Player */}
                <div className="border-l-4 border-blue-500 pl-4">
                  <h4 className="font-semibold text-blue-700 mb-2">Option 1: VLC Media Player</h4>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>Copy the HLS URL above</li>
                    <li>Open VLC Media Player</li>
                    <li>Go to Media → Open Network Stream</li>
                    <li>Paste the URL and click Play</li>
                  </ol>
                </div>

                {/* Browser */}
                <div className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-semibold text-green-700 mb-2">Option 2: Browser (Coming Soon)</h4>
                  <p className="text-sm text-gray-700">
                    Web player with quality selector will be available soon
                  </p>
                </div>

                {/* Download */}
                <div className="border-l-4 border-purple-500 pl-4">
                  <h4 className="font-semibold text-purple-700 mb-2">Option 3: Download for Offline</h4>
                  <p className="text-sm text-gray-700 mb-2">
                    To download all files for offline playback:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
                    <li>Go to S3 bucket: {hlsData.masterPlaylist.split('/').slice(0, -1).join('/')}</li>
                    <li>Download the entire hls/ folder</li>
                    <li>Open master.m3u8 with VLC or any HLS player</li>
                  </ol>
                  <a
                    href={`https://s3.console.aws.amazon.com/s3/buckets/${process.env.NEXT_PUBLIC_S3_BUCKET || 'your-bucket'}?prefix=${hlsData.masterPlaylist.split('/').slice(0, -1).join('/')}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-2 text-sm text-purple-600 hover:underline"
                  >
                    <ExternalLink size={14} />
                    Open in S3 Console
                  </a>
                </div>
              </div>
            </div>

            {/* Technical Info */}
            <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600 font-mono">
              <div><strong>Master Playlist:</strong> {hlsData.masterPlaylist}</div>
              <div><strong>HLS Base URL:</strong> {hlsData.hlsBaseUrl}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
