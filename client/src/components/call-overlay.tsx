'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useCallContext } from '@/contexts/call-context';

/** Renders the full-screen ringing/connected call UI, mounted once app-wide (see (main)/layout.tsx)
 * so an incoming call is visible no matter which page is open - not tied to any one conversation. */
export function CallOverlay() {
  const call = useCallContext();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // call.status is a dependency (not just the streams) because these elements are
  // conditionally rendered based on status - see docs/changes/2026-09-01-video-calling-phase2-webrtc-plumbing.md
  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = call.localStream;
  }, [call.localStream, call.status]);

  useEffect(() => {
    if (call.callType === 'VIDEO' && remoteVideoRef.current) remoteVideoRef.current.srcObject = call.remoteStream;
    if (call.callType === 'AUDIO' && remoteAudioRef.current) remoteAudioRef.current.srcObject = call.remoteStream;
  }, [call.remoteStream, call.callType, call.status]);

  useEffect(() => {
    if (call.error) toast.error(call.error);
  }, [call.error]);

  if (call.status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white">
      {call.status === 'ringing' && call.incomingCall ? (
        <>
          <Avatar className="mb-4 h-20 w-20">
            <AvatarImage src={call.incomingCall.caller.avatarUrl ?? undefined} />
            <AvatarFallback>{call.incomingCall.caller.username[0].toUpperCase()}</AvatarFallback>
          </Avatar>
          <p className="mb-1 text-lg font-semibold">{call.incomingCall.caller.username}</p>
          <p className="mb-8 text-sm text-gray-400">
            Incoming {call.incomingCall.type === 'VIDEO' ? 'video' : 'voice'} call...
          </p>
          <div className="flex gap-8">
            <button onClick={call.answerCall} aria-label="Answer" className="rounded-full bg-green-500 p-4">
              <Phone className="h-6 w-6" />
            </button>
            <button onClick={call.rejectCall} aria-label="Decline" className="rounded-full bg-red-500 p-4">
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </>
      ) : (
        <>
          {call.callType === 'VIDEO' ? (
            <div className="relative h-full w-full">
              <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="absolute bottom-24 right-4 h-32 w-24 rounded-lg object-cover ring-2 ring-white"
              />
            </div>
          ) : (
            <>
              <audio ref={remoteAudioRef} autoPlay />
              <Avatar className="mb-4 h-20 w-20">
                <AvatarImage src={call.peer?.avatarUrl ?? undefined} />
                <AvatarFallback>{call.peer?.username[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <p className="mb-1 text-lg font-semibold">{call.peer?.username}</p>
              <p className="text-sm text-gray-400">{call.status === 'calling' ? 'Calling...' : 'Connected'}</p>
            </>
          )}

          <div className="absolute bottom-6 flex gap-4">
            <button
              onClick={call.toggleMute}
              aria-label={call.isMuted ? 'Unmute' : 'Mute'}
              className={`rounded-full p-4 ${call.isMuted ? 'bg-white text-black' : 'bg-white/20'}`}
            >
              {call.isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
            {call.callType === 'VIDEO' && (
              <button
                onClick={call.toggleCamera}
                aria-label={call.isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                className={`rounded-full p-4 ${call.isCameraOff ? 'bg-white text-black' : 'bg-white/20'}`}
              >
                {call.isCameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </button>
            )}
            <button onClick={call.endCall} aria-label="Hang up" className="rounded-full bg-red-500 p-4">
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
