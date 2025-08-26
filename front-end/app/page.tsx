"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Send, Bot, User, TrendingUp, PieChart, BarChart3, Sparkles, Shield, AlertCircle, Paperclip, X, FileText, Image, Video, Music } from "lucide-react"
import { useAgentStore, useAgentActions } from "@/app/src/stores/useAgentStore"

const getInitials = (name: string) => {
  const names = name.split(' ');
  const initials = names.map(n => n[0]);
  if (initials.length > 2) {
    return initials.slice(0, 2).join('').toUpperCase();
  }
  return initials.join('').toUpperCase();
};

// Legacy visualization function removed - we only use ADK artifacts now

export default function BankingAIChat() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userIdInput, setUserIdInput] = useState("")
  const [inputValue, setInputValue] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if ((!inputValue.trim() && selectedFiles.length === 0) || isLoading) return

    const messageToSend = inputValue.trim()
    setInputValue("")
    
    if (error) clearError()
    
    // Send message with attachments if any
    await sendMessage(messageToSend || "Here are some files to analyze", selectedFiles)
    setSelectedFiles([])
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    setSelectedFiles(prev => [...prev, ...files])
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image className="w-4 h-4" />
    if (mimeType.startsWith('video/')) return <Video className="w-4 h-4" />
    if (mimeType.startsWith('audio/')) return <Music className="w-4 h-4" />
    return <FileText className="w-4 h-4" />
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
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
                    {/* Only handle ADK artifacts - no legacy charts */}
                    {message.hasVisualization && message.artifactImageUrl && (
                      <div className="mt-3 rounded-lg border overflow-hidden slide-in-up">
                        <img 
                          src={message.artifactImageUrl} 
                          alt="Generated Chart" 
                          className="w-full h-auto"
                          style={{ maxWidth: '100%', height: 'auto' }}
                          onLoad={() => {
                            console.log('✅ Artifact image loaded successfully');
                          }}
                          onError={(e) => {
                            console.error('❌ Artifact image failed to load');
                            console.error('URL length:', message.artifactImageUrl?.length);
                            console.error('URL prefix:', message.artifactImageUrl?.substring(0, 100));
                            
                            // If it's a blob URL that failed, revoke it to free memory
                            if (message.artifactImageUrl?.startsWith('blob:')) {
                              URL.revokeObjectURL(message.artifactImageUrl);
                            }
                            
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    )}
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
            {/* Selected Files Display */}
            {selectedFiles.length > 0 && (
              <div className="mb-3 p-3 bg-secondary/10 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="w-4 h-4 text-secondary" />
                  <span className="text-sm font-medium">Selected Files ({selectedFiles.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 bg-background/50 rounded-lg px-3 py-2 text-xs border">
                      {getFileIcon(file.type)}
                      <span className="truncate max-w-32">{file.name}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeFile(index)}
                        className="h-4 w-4 p-0 hover:bg-red-100"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                accept="image/*,video/*,audio/*,.pdf,.txt,.doc,.docx,.csv,.json"
                className="hidden"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="shrink-0 border-secondary/20 hover:bg-secondary/10 transition-all duration-300"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
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
                disabled={(!inputValue.trim() && selectedFiles.length === 0) || isLoading}
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
