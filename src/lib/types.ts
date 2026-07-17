export interface Participant {
  id: string
  name: string
}

export type GameStatus = 'OPEN' | 'CLOSED'

export interface Buzz {
  participantId: string
  participantName: string
  serverTimestamp: number
  rank: number
}

export interface GameState {
  currentQuestion: number
  status: GameStatus
  participants: Participant[]
  buzzQueue: Buzz[]
}
