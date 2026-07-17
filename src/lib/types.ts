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
  totalQuestions: number
  status: GameStatus
  participants: Participant[]
  buzzQueue: Buzz[]
}

export type QuizStatus = 'DRAFT' | 'READY' | 'RUNNING' | 'FINISHED' | 'ARCHIVED'

export interface QuizStats {
  totalParticipants: number
  totalQuestions: number
  winner: string
  completionTime: number
  fastestBuzz: number
}

export interface Quiz {
  id: string
  name: string
  description: string
  totalQuestions: number
  status: QuizStatus
  currentQuestion: number
  questionStatus: GameStatus
  participants: Participant[]
  buzzQueue: Buzz[]
  createdAt: number
  updatedAt: number
  lastPlayedAt?: number
  statistics?: QuizStats
}

export interface AppMeta {
  activeQuizId: string | null
}
