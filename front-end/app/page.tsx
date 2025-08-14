"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Send, Bot, User, TrendingUp, PieChart, BarChart3, Sparkles, Shield, AlertCircle } from "lucide-react"
import { useAgentStore, useAgentActions } from "@/app/src/stores/useAgentStore"

export default function BankingAIChat() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userIdInput, setUserIdInput] = useState("")
  const [inputValue, setInputValue] = useState("")
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Agent store
  const { 
    messages, 
    isLoading, 
    error, 
    userId,
    sendMessage, 
    clearMessages, 
    setUserId,
    clearError,
  } = useAgentStore()
  
  const agentActions = useAgentActions()

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]")
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      }
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleAuthentication = () => {
    if (userIdInput.trim()) {
      const trimmedUserId = userIdInput.trim()
      setUserId(trimmedUserId)
      setIsAuthenticated(true)
    }
  }

  const handleKeyPressAuth = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleAuthentication()
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const messageToSend = inputValue.trim()
    setInputValue("")
    
    if (error) clearError()
    
    await sendMessage(messageToSend)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const renderVisualization = (html: string) => {
    return (
      <div
        className="visualization mt-3 slide-in-up"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5 flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
        <Card className="w-full max-w-md glass-effect glow slide-in-up relative z-10">
          <CardHeader className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-secondary to-accent flex items-center justify-center float pulse-glow">
              <Shield className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl gradient-text">Secure Access</CardTitle>
            <p className="text-muted-foreground">Enter your User ID to access your AI Banking Advisor</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="userId" className="text-sm font-medium">
                User ID
              </label>
              <Input
                id="userId"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyPress={handleKeyPressAuth}
                placeholder="Enter your unique user ID"
                className="bg-background/50 backdrop-blur-sm border-secondary/20 focus:border-secondary focus:ring-secondary/20 transition-all duration-300"
                autoFocus
              />
            </div>
            <Button
              onClick={handleAuthentication}
              disabled={!userIdInput.trim()}
              className="w-full bg-gradient-to-r from-secondary to-accent hover:from-secondary/80 hover:to-accent/80 transition-all duration-300 hover:scale-105 pulse-glow"
            >
              <Shield className="w-4 h-4 mr-2" />
              Access Banking Advisor
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Your data is encrypted and secure. This ID helps us personalize your banking experience.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/5">
      <div className="border-b glass-effect sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-secondary to-accent flex items-center justify-center float pulse-glow">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold gradient-text">AI Banking Advisor</h1>
              <p className="text-sm text-muted-foreground">Welcome back, {userId}</p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-secondary animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Chat Container */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Card className="h-[calc(100vh-200px)] flex flex-col glass-effect glow">
          {/* Messages Area */}
          <ScrollArea ref={scrollAreaRef} className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`flex gap-3 slide-in-up ${message.sender === "user" ? "justify-end" : "justify-start"}`}
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {message.sender === "agent" && (
                    <Avatar className={`w-8 h-8 bg-gradient-to-r float ${message.isError ? 'from-red-500 to-red-600' : 'from-secondary to-accent'}`}>
                      <AvatarFallback className="bg-transparent">
                        {message.isError ? <AlertCircle className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div
                    className={`max-w-[70%] rounded-lg px-4 py-3 transition-all duration-300 hover:scale-105 ${
                      message.sender === "user"
                        ? "bg-gradient-to-r from-primary to-secondary text-primary-foreground ml-auto shimmer"
                        : message.isError 
                          ? "bg-red-50 border border-red-200 backdrop-blur-sm"
                          : "bg-card/80 border backdrop-blur-sm"
                    }`}
                  >
                    <p className={`text-sm leading-relaxed ${message.isError ? 'text-red-700' : ''}`}>
                      {message.content}
                    </p>
                    {message.hasVisualization && message.visualizationHtml && renderVisualization(message.visualizationHtml)}
                    <p className="text-xs opacity-70 mt-2">
                      {message.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {message.sender === "user" && (
                    <Avatar className="w-8 h-8 bg-gradient-to-r from-accent to-secondary float">
                      <AvatarFallback className="bg-transparent">
                        <User className="w-4 h-4 text-white" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start slide-in-up">
                  <Avatar className="w-8 h-8 bg-gradient-to-r from-secondary to-accent float">
                    <AvatarFallback className="bg-transparent">
                      <Bot className="w-4 h-4 text-white" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-card/80 border rounded-lg px-4 py-3 backdrop-blur-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-secondary rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-secondary rounded-full animate-bounce"
                        style={{ animationDelay: "0.1s" }}
                      />
                      <div
                        className="w-2 h-2 bg-secondary rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="px-4 py-2 border-t backdrop-blur-sm">
            <div className="flex gap-2 mb-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => agentActions.requestSpendingAnalysis()}
                disabled={isLoading}
                className="text-xs hover:bg-gradient-to-r hover:from-secondary/20 hover:to-accent/20 transition-all duration-300 hover:scale-105"
              >
                <TrendingUp className="w-3 h-3 mr-1" />
                Spending Analysis
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => agentActions.requestPortfolioBreakdown()}
                disabled={isLoading}
                className="text-xs hover:bg-gradient-to-r hover:from-secondary/20 hover:to-accent/20 transition-all duration-300 hover:scale-105"
              >
                <PieChart className="w-3 h-3 mr-1" />
                Portfolio
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => agentActions.requestBudgetComparison()}
                disabled={isLoading}
                className="text-xs hover:bg-gradient-to-r hover:from-secondary/20 hover:to-accent/20 transition-all duration-300 hover:scale-105"
              >
                <BarChart3 className="w-3 h-3 mr-1" />
                Budget Report
              </Button>
            </div>
          </div>

          <CardContent className="p-4 pt-0">
            <div className="flex gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me about your finances, investments, or request a chart..."
                className="flex-1 bg-background/50 backdrop-blur-sm border-secondary/20 focus:border-secondary focus:ring-secondary/20 transition-all duration-300"
                disabled={isLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!inputValue.trim() || isLoading}
                size="icon"
                className="shrink-0 bg-gradient-to-r from-secondary to-accent hover:from-secondary/80 hover:to-accent/80 transition-all duration-300 hover:scale-110 pulse-glow"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
