import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { 
  History, 
  Calendar, 
  TrendingUp, 
  AlertTriangle, 
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'

export function UserHistoryPanel({ account, fetchUserHistory }) {
  const [userHistory, setUserHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchHistory = async () => {
    if (!account || !fetchUserHistory) return
    
    setLoading(true)
    setError('')
    
    try {
      const history = await fetchUserHistory(account)
      setUserHistory(history)
    } catch (err) {
      console.error('Error fetching user history:', err)
      setError('Failed to fetch user history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [account, fetchUserHistory])

  const formatTimestamp = (timestamp) => {
    if (!timestamp || timestamp === 0) return 'Never'
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getHistoryScore = () => {
    if (!userHistory) return 0
    
    const { liquidations, successfulPayments } = userHistory
    const totalInteractions = liquidations + successfulPayments
    
    if (totalInteractions === 0) return 0
    
    // Calculate score: successful payments are positive, liquidations are negative
    const score = ((successfulPayments - liquidations * 2) / totalInteractions) * 100
    return Math.max(0, Math.min(100, score))
  }

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    if (score >= 40) return 'text-orange-600'
    return 'text-red-600'
  }

  const getScoreBadgeVariant = (score) => {
    if (score >= 80) return 'default'
    if (score >= 60) return 'secondary'
    return 'destructive'
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            User History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin mr-2" />
            Loading history...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            User History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={fetchHistory} className="mt-4" variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (!userHistory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            User History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No history data available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const historyScore = getHistoryScore()
  const hasInteracted = userHistory.firstInteractionTimestamp > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            User History
          </CardTitle>
          <Button onClick={fetchHistory} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* History Score */}
        <div className="text-center">
          <div className="mb-2">
            <span className="text-sm text-muted-foreground">History Score</span>
          </div>
          <div className={`text-3xl font-bold ${getScoreColor(historyScore)}`}>
            {historyScore.toFixed(0)}%
          </div>
          <Badge variant={getScoreBadgeVariant(historyScore)} className="mt-2">
            {historyScore >= 80 ? 'Excellent' : 
             historyScore >= 60 ? 'Good' : 
             historyScore >= 40 ? 'Fair' : 'Poor'}
          </Badge>
        </div>

        {/* First Interaction */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-blue-500" />
            <div>
              <p className="font-medium">First Interaction</p>
              <p className="text-sm text-muted-foreground">
                {formatTimestamp(userHistory.firstInteractionTimestamp)}
              </p>
            </div>
          </div>
          {hasInteracted && (
            <Badge variant="outline">
              <Clock className="h-3 w-3 mr-1" />
              Member
            </Badge>
          )}
        </div>

        {/* Statistics Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Successful Payments */}
          <div className="text-center p-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-green-700">
              {userHistory.successfulPayments}
            </div>
            <div className="text-sm text-green-600">
              Successful Payments
            </div>
          </div>

          {/* Liquidations */}
          <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
            <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
            <div className="text-2xl font-bold text-red-700">
              {userHistory.liquidations}
            </div>
            <div className="text-sm text-red-600">
              Liquidations
            </div>
          </div>
        </div>

        {/* Performance Insights */}
        {hasInteracted && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">Performance Insights</span>
            </div>
            <div className="text-sm text-blue-700">
              {userHistory.liquidations === 0 && userHistory.successfulPayments > 0 && (
                <p>✅ Perfect payment record - no liquidations!</p>
              )}
              {userHistory.liquidations > 0 && userHistory.successfulPayments > userHistory.liquidations && (
                <p>⚠️ More successful payments than liquidations - improving trend</p>
              )}
              {userHistory.liquidations > userHistory.successfulPayments && (
                <p>🔴 Consider improving collateral management to avoid liquidations</p>
              )}
              {userHistory.successfulPayments === 0 && userHistory.liquidations === 0 && (
                <p>📊 New user - no payment history yet</p>
              )}
            </div>
          </div>
        )}

        {!hasInteracted && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This user has not interacted with the protocol yet.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
