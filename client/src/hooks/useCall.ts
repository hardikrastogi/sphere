'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '@/lib/socket';
import { ICE_SERVERS } from '@/lib/webrtc';

export type CallType = 'VIDEO' | 'AUDIO';
export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connected';

const RING_TIMEOUT_MS = 45_000;

function mediaErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Camera/microphone access was denied';
    if (err.name === 'NotFoundError') return 'No camera or microphone found';
  }
  return err instanceof Error ? err.message : 'Failed to access camera/microphone';
}

export interface CallPeer {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface IncomingCall {
  callId: string;
  type: CallType;
  caller: CallPeer;
}

/**
 * WebRTC + signaling plumbing for 1:1 calls. Only handles the mechanics (peer
 * connection, media, the offer/answer/ICE dance, mute/camera) - rendering call
 * UI is the caller's job. Meant to be instantiated exactly once, globally (see
 * CallProvider), so incoming calls are caught no matter what page is open -
 * startCall() takes the callee directly rather than being bound to one page's
 * conversation.
 */
export function useCall() {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callType, setCallType] = useState<CallType | null>(null);
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRingTimeout = () => {
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    ringTimeoutRef.current = null;
  };

  const cleanup = useCallback(() => {
    clearRingTimeout();
    pcRef.current?.close();
    pcRef.current = null;
    callIdRef.current = null;
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    localStream?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIncomingCall(null);
    setCallType(null);
    setPeer(null);
    setIsMuted(false);
    setIsCameraOff(false);
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localStream]);

  const createPeerConnection = useCallback((callId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        getSocket().emit('ice_candidate', { callId, candidate: e.candidate.toJSON() });
      }
    };
    pc.ontrack = (e) => {
      setRemoteStream(e.streams[0]);
    };
    pc.oniceconnectionstatechange = () => {
      // 'disconnected' can recover on its own; only 'failed' means the connection is truly dead
      // (no TURN relay configured, per the Phase 0 decision, so there's no path to recover it).
      if (pc.iceConnectionState === 'failed') {
        getSocket().emit('call_end', { callId });
        setError('Connection lost');
        cleanup();
      }
    };

    return pc;
  }, [cleanup]);

  const flushPendingCandidates = useCallback(async (pc: RTCPeerConnection) => {
    for (const candidate of pendingCandidatesRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
    pendingCandidatesRef.current = [];
  }, []);

  const startCall = useCallback(
    async (callee: CallPeer, type: CallType) => {
      if (status !== 'idle') return;
      setError(null);
      const callId = crypto.randomUUID();
      callIdRef.current = callId;
      setCallType(type);
      setPeer(callee);
      setStatus('calling');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: type === 'VIDEO', audio: true });
        setLocalStream(stream);

        const pc = createPeerConnection(callId);
        pcRef.current = pc;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        getSocket().emit('call_invite', { callId, calleeId: callee.id, type, offer });

        ringTimeoutRef.current = setTimeout(() => {
          getSocket().emit('call_timeout', { callId });
          setError('No answer');
          cleanup();
        }, RING_TIMEOUT_MS);
      } catch (err) {
        setError(mediaErrorMessage(err));
        cleanup();
      }
    },
    [status, createPeerConnection, cleanup],
  );

  const answerCall = useCallback(async () => {
    if (!incomingCall || !pendingOfferRef.current) return;
    const { callId, type, caller } = incomingCall;
    // Consume the pending offer immediately so a rapid double-click (or double-tap) on
    // Answer can't race two peer connections + two getUserMedia calls off the same invite.
    const offer = pendingOfferRef.current;
    pendingOfferRef.current = null;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: type === 'VIDEO', audio: true });
      setLocalStream(stream);

      const pc = createPeerConnection(callId);
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      getSocket().emit('call_answer', { callId, answer });
      setCallType(type);
      setPeer(caller);
      setIncomingCall(null);
      setStatus('connected');
    } catch (err) {
      setError(mediaErrorMessage(err));
      getSocket().emit('call_reject', { callId });
      cleanup();
    }
  }, [incomingCall, createPeerConnection, flushPendingCandidates, cleanup]);

  const rejectCall = useCallback(() => {
    if (incomingCall) {
      getSocket().emit('call_reject', { callId: incomingCall.callId });
    }
    cleanup();
  }, [incomingCall, cleanup]);

  const endCall = useCallback(() => {
    if (callIdRef.current) {
      getSocket().emit('call_end', { callId: callIdRef.current });
    }
    cleanup();
  }, [cleanup]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      localStream?.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, [localStream]);

  const toggleCamera = useCallback(() => {
    setIsCameraOff((prev) => {
      const next = !prev;
      localStream?.getVideoTracks().forEach((t) => {
        t.enabled = !next;
      });
      return next;
    });
  }, [localStream]);

  useEffect(() => {
    const socket = getSocket();

    const onCallInvite = (payload: { callId: string; type: CallType; offer: RTCSessionDescriptionInit; caller: CallPeer }) => {
      // Already in a call - the server would say call_busy, but guard here too.
      if (status !== 'idle') return;
      pendingOfferRef.current = payload.offer;
      callIdRef.current = payload.callId;
      setIncomingCall({ callId: payload.callId, type: payload.type, caller: payload.caller });
      setStatus('ringing');
    };

    const onCallAnswer = async (payload: { callId: string; answer: RTCSessionDescriptionInit }) => {
      if (payload.callId !== callIdRef.current || !pcRef.current) return;
      clearRingTimeout();
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.answer));
      await flushPendingCandidates(pcRef.current);
      setStatus('connected');
    };

    const onIceCandidate = async (payload: { callId: string; candidate: RTCIceCandidateInit }) => {
      if (payload.callId !== callIdRef.current) return;
      const pc = pcRef.current;
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        pendingCandidatesRef.current.push(payload.candidate);
      }
    };

    const onCallEnded = () => cleanup();
    const onCallRejected = () => {
      setError('Call declined');
      cleanup();
    };
    // Sent when this same user answered or declined the call from another open tab/device -
    // this tab was also ringing for it and needs to silently stop, no error toast.
    const onCallRingStop = (payload: { callId: string }) => {
      if (payload.callId === callIdRef.current && status === 'ringing') cleanup();
    };
    const onCallBusy = () => {
      setError('They are already in another call');
      cleanup();
    };
    const onCallUnavailable = () => {
      setError('They are unavailable right now');
      cleanup();
    };

    socket.on('call_invite', onCallInvite);
    socket.on('call_answer', onCallAnswer);
    socket.on('ice_candidate', onIceCandidate);
    socket.on('call_reject', onCallRejected);
    socket.on('call_timeout', onCallEnded);
    socket.on('call_end', onCallEnded);
    socket.on('call_ring_stop', onCallRingStop);
    socket.on('call_busy', onCallBusy);
    socket.on('call_unavailable', onCallUnavailable);

    return () => {
      socket.off('call_invite', onCallInvite);
      socket.off('call_answer', onCallAnswer);
      socket.off('ice_candidate', onIceCandidate);
      socket.off('call_reject', onCallRejected);
      socket.off('call_timeout', onCallEnded);
      socket.off('call_end', onCallEnded);
      socket.off('call_ring_stop', onCallRingStop);
      socket.off('call_busy', onCallBusy);
      socket.off('call_unavailable', onCallUnavailable);
    };
  }, [status, cleanup, flushPendingCandidates]);

  return {
    status,
    callType,
    peer,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOff,
    error,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleCamera,
  };
}
