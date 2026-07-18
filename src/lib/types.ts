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

export type QuizStatus = 'DRAFT' | 'PUBLISHED' | 'RUNNING' | 'FINISHED' | 'ARCHIVED'

export interface LiveState {
  currentQuestion: number
  status: string
  participants: { id: string; name: string }[]
  buzzQueue: { participantId: string; participantName: string; rank: number }[]
}

export interface QuizStats {
  totalParticipants: number
  totalQuestions: number
  winner: string
  completionTime: number
  fastestBuzz: number
}

export interface Question {
  id: string
  text: string
}

export interface Quiz {
  id: string
  publicId: string
  organizerId: string
  name: string
  description: string
  totalQuestions: number
  status: QuizStatus
  createdAt: number
  updatedAt: number
  lastPlayedAt?: number
  statistics?: QuizStats
}
