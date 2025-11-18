interface Session {
  userId: string;
  sessionId: string;
  agentId: string;
}

interface Props {
  session: Session | null;
}

export default function SessionInfo({ session }: Props) {
  if (!session) return null;

  return (
    <div className="session-info">
      <div className="session-item">
        <span className="label">用户ID:</span>
        <span className="value">{session.userId.slice(0, 8)}...</span>
      </div>
      <div className="session-item">
        <span className="label">会话ID:</span>
        <span className="value">{session.sessionId.slice(0, 8)}...</span>
      </div>
      <div className="session-item">
        <span className="label">Agent ID:</span>
        <span className="value">{session.agentId.slice(0, 8)}...</span>
      </div>
    </div>
  );
}
