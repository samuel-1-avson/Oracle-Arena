import { OracleArenaApp } from '@/components/arena/OracleArenaApp';
import { normalizeRoomCode } from '@/lib/game/multiplayer';

interface HomePageProps {
  searchParams: Promise<{ autostart?: string; room?: string }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const initialAutoStart = params?.autostart === '1';
  const initialRoomCode = params?.room ? normalizeRoomCode(params.room) : '';
  return (
    <OracleArenaApp
      initialAutoStart={initialAutoStart}
      initialRoomCode={initialRoomCode}
    />
  );
}
