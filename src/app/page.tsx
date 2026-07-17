import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-3xl font-bold">Quiz Buzzer</h1>
        <p className="text-zinc-500">Live college quiz event</p>
        <div className="space-y-3 pt-4">
          <Link
            href="/participant"
            className="block rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Join as Participant
          </Link>
          <Link
            href="/organizer"
            className="block rounded-lg border px-4 py-3 text-sm font-semibold hover:bg-zinc-50"
          >
            Organizer Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
