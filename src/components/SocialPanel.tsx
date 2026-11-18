import React, { useEffect, useRef, useState } from 'react';
import { Check, Mic, MicOff, Send, UserPlus, Users, X } from 'lucide-react';
import type { BrFriendRecord } from '../firebase';
import { brOnline, type PartyState } from '../online';

interface SocialPanelProps {
  playerId: string;
  friends: BrFriendRecord[];
  party: PartyState | null;
  partyChat: { sender: string; text: string }[];
  pendingInvite: { partyCode: string; fromName: string } | null;
  onAddFriend: (query: string) => Promise<string | null>;
  onUpdateFriend: (friendshipId: string, status: 'accepted' | 'blocked' | 'removed') => void;
  onAcceptPartyInvite: (code: string) => void;
  onClose: () => void;
}

export const SocialPanel: React.FC<SocialPanelProps> = ({
  playerId,
  friends,
  party,
  partyChat,
  pendingInvite,
  onAddFriend,
  onUpdateFriend,
  onAcceptPartyInvite,
  onClose
}) => {
  const [friendInput, setFriendInput] = useState('');
  const [friendError, setFriendError] = useState<string | null>(null);
  const [partyCodeInput, setPartyCodeInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [micActive, setMicActive] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  useEffect(() => {
    const unsub = brOnline.subscribe(async (type, raw) => {
      if (type !== 'br:voiceSignal') return;
      const p = raw as { fromClientId?: string; signal?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } };
      const fromId = p.fromClientId;
      if (!fromId || !p.signal) return;

      let pc = peersRef.current.get(fromId);
      if (!pc) {
        pc = createPeerConnection(fromId);
      }

      if (p.signal.sdp) {
        await pc.setRemoteDescription(new RTCSessionDescription(p.signal.sdp));
        if (p.signal.sdp.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          brOnline.sendVoiceSignal({ sdp: pc.localDescription });
        }
      } else if (p.signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(p.signal.candidate));
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!));
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        brOnline.sendVoiceSignal({ candidate: ev.candidate });
      }
    };
    pc.ontrack = (ev) => {
      const audio = document.createElement('audio');
      audio.srcObject = ev.streams[0];
      audio.autoplay = true;
      audio.play().catch(() => {});
    };
    peersRef.current.set(peerId, pc);
    return pc;
  };

  const toggleVoiceChat = async () => {
    setVoiceError(null);
    if (micActive) {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      setMicActive(false);
      return;
    }

    if (!party) {
      setVoiceError('Create or join a party first to start Voice Chat.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      setMicActive(true);

      // Offer WebRTC audio to party peers
      for (const m of party.members) {
        if (m.playerId === playerId) continue;
        const pc = createPeerConnection(m.clientId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        brOnline.sendVoiceSignal({ sdp: pc.localDescription });
      }
    } catch {
      setVoiceError('Microphone permission unavailable in this browser.');
    }
  };

  const submitAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setFriendError(null);
    const err = await onAddFriend(friendInput);
    if (err) setFriendError(err);
    else setFriendInput('');
  };

  const sendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    brOnline.sendPartyChat(chatInput.trim());
    setChatInput('');
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[400px] bg-slate-950/95 border-l border-slate-800 z-30 flex flex-col p-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-sky-400" />
          <h2 className="font-display text-xl font-black uppercase">Friends & Party</h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-slate-900 border border-slate-700 hover:border-slate-500 text-slate-300 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 py-4 pr-1">
        {pendingInvite && (
          <div className="bg-amber-950/60 border border-amber-400 rounded-xl p-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-amber-300">Party Invite from {pendingInvite.fromName}</p>
              <p className="text-[11px] text-slate-300 tabular">Code: {pendingInvite.partyCode}</p>
            </div>
            <button
              onClick={() => onAcceptPartyInvite(pendingInvite.partyCode)}
              className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
            >
              Join
            </button>
          </div>
        )}

        {/* Party & Voice Chat Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300">
              Squad Party {party ? `(${party.code})` : ''}
            </h3>
            <button
              onClick={toggleVoiceChat}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                micActive
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 border border-slate-700'
              }`}
            >
              {micActive ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
              {micActive ? 'Voice On' : 'Voice Chat'}
            </button>
          </div>
          {voiceError && <p className="text-[11px] text-rose-400">{voiceError}</p>}

          {!party ? (
            <div className="space-y-2">
              <button
                onClick={() => brOnline.createParty()}
                className="w-full py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Create Squad Party
              </button>
              <div className="flex gap-2">
                <input
                  value={partyCodeInput}
                  onChange={(e) => setPartyCodeInput(e.target.value.toUpperCase())}
                  placeholder="Party Code"
                  maxLength={6}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs uppercase text-white"
                />
                <button
                  onClick={() => brOnline.joinParty(partyCodeInput)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-bold cursor-pointer"
                >
                  Join
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1">
                {party.members.map((m) => (
                  <div
                    key={m.clientId}
                    className="flex items-center justify-between bg-slate-950 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-bold text-white">{m.username}</span>
                    <span className="text-emerald-400 text-[10px] font-bold uppercase">Ready</span>
                  </div>
                ))}
              </div>
              <div className="bg-slate-950 rounded-lg p-2 max-h-28 overflow-y-auto space-y-1">
                {partyChat.length === 0 ? (
                  <p className="text-[11px] text-slate-500">Party text & voice ready.</p>
                ) : (
                  partyChat.map((c, i) => (
                    <p key={i} className="text-[11px] text-slate-200">
                      <strong className="text-sky-300">{c.sender}:</strong> {c.text}
                    </p>
                  ))
                )}
              </div>
              <form onSubmit={sendChat} className="flex gap-1.5">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Message squad..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <button
                  type="submit"
                  className="p-2 rounded-lg bg-sky-500 text-slate-950 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Add Friend */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Friends List</h3>
          <form onSubmit={submitAddFriend} className="flex gap-2">
            <input
              value={friendInput}
              onChange={(e) => setFriendInput(e.target.value)}
              placeholder="Username or Player ID"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" /> Add
            </button>
          </form>
          {friendError && <p className="text-[11px] text-rose-400">{friendError}</p>}

          {friends.length === 0 ? (
            <p className="text-xs text-slate-500">No friends added yet. Add teammates by username!</p>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => {
                const isIncoming = f.friend_id === playerId && f.status === 'pending';
                const targetId = f.player_id === playerId ? f.friend_id : f.player_id;
                return (
                  <div
                    key={f.friendship_id}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">{f.friend_name}</p>
                      <p className="text-[10px] text-slate-400 uppercase">{f.status}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isIncoming && (
                        <button
                          onClick={() => onUpdateFriend(f.friendship_id, 'accepted')}
                          className="p-1.5 rounded bg-emerald-500 text-slate-950 cursor-pointer"
                          title="Accept Friend"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {f.status === 'accepted' && party && (
                        <button
                          onClick={() => brOnline.inviteToParty(targetId)}
                          className="px-2 py-1 rounded bg-sky-500 text-slate-950 text-[10px] font-bold cursor-pointer"
                        >
                          Invite
                        </button>
                      )}
                      <button
                        onClick={() => onUpdateFriend(f.friendship_id, 'removed')}
                        className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Remove"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
