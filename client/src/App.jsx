"use client"

import { useState, useEffect, useRef } from "react"
import { io } from "socket.io-client"
import EmojiPicker from 'emoji-picker-react'

import "./App.css"

const backendHost = window.location.hostname
const socket = io(`http://${backendHost}:5000`)

function App() {
  const [unreadMessages, setUnreadMessages] = useState({})
  const [email, setEmail] = useState(localStorage.getItem("email") || "")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState(localStorage.getItem("username") || "")
  const [searchTerm, setSearchTerm] = useState("")
  const [message, setMessage] = useState("")
  const [chats, setChats] = useState({})
  const [onlineUsers, setOnlineUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [typingStatus, setTypingStatus] = useState("")
  const [soundOn, setSoundOn] = useState(true)
  const [isLoggedIn, setIsLoggedIn] = useState()
  const [formError, setFormError] = useState("")
  const [showConversation, setShowConversation] = useState(false)
  const messagesEndRef = useRef(null)
  const audioContextRef = useRef(null)
  const bufferRef = useRef(null)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)


  const handlePrivateMessage = (data) => {
    const { room, username: sender } = data;

    setChats((prev) => {
      const updatedRoom = [...(prev[room] || []), data];
      return { ...prev, [room]: updatedRoom };
    });

    const isChatOpen = sender === selectedUser;

    if (!isChatOpen) {
      // 🔴 Add notification dot
      setUnreadMessages((prev) => ({
        ...prev,
        [sender]: (prev[sender] || 0) + 1,
      }));

      // 🔔 Play sound
      if (soundOn) {
        playNotification();
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn && username && onlineUsers.length > 0) {
      onlineUsers.forEach((user) => {
        if (user !== username) {
          const room = getRoomName(username, user)
          socket.emit("join_room", { room })
        }
      })
    }
  }, [isLoggedIn, username, onlineUsers])


  // Load notification sound once
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    fetch("/mixkit-correct-answer-tone-2870.wav")
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => audioContextRef.current.decodeAudioData(arrayBuffer))
      .then((decodedBuffer) => (bufferRef.current = decodedBuffer))
      .catch((err) => console.error("Error loading sound:", err))
  }, [])

  // ✅ Merged socket listeners here:
  useEffect(() => {
    const handlePrivateMessage = (data) => {
      const { room, username: sender } = data

      setChats((prev) => {
        const updatedRoom = [...(prev[room] || []), data]
        return { ...prev, [room]: updatedRoom }
      })

      if (sender !== selectedUser) {
        setUnreadMessages((prev) => ({
          ...prev,
          [sender]: (prev[sender] || 0) + 1,
        }))
      }

      if (sender !== username && soundOn) {
        playNotification()
      }
    }

    const handleOnlineUsers = (users) => setOnlineUsers(users)

    const handleUserTyping = (data) => {
      if (data.username === selectedUser) {
        setTypingStatus(`${data.username} is typing...`)
        clearTimeout(window.typingTimeout)
        window.typingTimeout = setTimeout(() => setTypingStatus(""), 2000)
      }
    }

    const handleRegisterFailed = (err) => {
      setFormError(err.message)
      setIsLoggedIn(false)
      localStorage.removeItem("isLoggedIn")
    }

    socket.on("receive_private_message", handlePrivateMessage)
    socket.on("online_users", handleOnlineUsers)
    socket.on("user_typing", handleUserTyping)
    socket.on("register_failed", handleRegisterFailed)

    return () => {
      socket.off("receive_private_message", handlePrivateMessage)
      socket.off("online_users", handleOnlineUsers)
      socket.off("user_typing", handleUserTyping)
      socket.off("register_failed", handleRegisterFailed)
    }
  }, [selectedUser, username, soundOn])

  useEffect(() => {
    if (selectedUser) {
      const room = getRoomName(username, selectedUser)
      socket.emit("join_room", { room })
    }
  }, [selectedUser, username])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chats, selectedUser, showConversation])

  const playNotification = () => {
    if (soundOn && bufferRef.current) {
      const gainNode = audioContextRef.current.createGain()
      gainNode.gain.setValueAtTime(0, audioContextRef.current.currentTime)
      gainNode.gain.linearRampToValueAtTime(1, audioContextRef.current.currentTime + 0.5)

      const source = audioContextRef.current.createBufferSource()
      source.buffer = bufferRef.current
      source.connect(gainNode)
      gainNode.connect(audioContextRef.current.destination)
      source.start(0)
    }
  }

  const getRoomName = (u1, u2) => [u1, u2].sort().join("-")

  const selectUser = (user) => {
    setSelectedUser(user); // open the chat

    // Clear the unread dot for this user
    setUnreadMessages((prev) => ({
      ...prev,
      [user]: 0,
    }));

    // Tell the backend who we're chatting with
    socket.emit("active_chat", {
      currentUser: username,
      chatWith: user,
    });
  };


  const loginUser = () => {
    const errors = []
    if (!email.includes("@")) errors.push("Invalid email")
    if (username.length < 4) errors.push("Username ≥ 4 chars")
    if (password.length < 4) errors.push("Password ≥ 4 chars")
    if (onlineUsers.includes(username)) errors.push("Username already taken")
    if (errors.length > 0) return setFormError(errors.join(" | "))
    setFormError("")
    localStorage.setItem("email", email)
    localStorage.setItem("username", username)
    localStorage.setItem("isLoggedIn", "true")
    socket.emit("register", { email, username })
    setIsLoggedIn(true)
  }

  const logout = () => {
    setIsLoggedIn(false)
    setSelectedUser(null)
    setUsername("")
    setEmail("")
    setPassword("")
    localStorage.removeItem("isLoggedIn")
    localStorage.removeItem("username")
    localStorage.removeItem("email")
    socket.emit("logout")
  }

  const sendMessage = () => {
    if (message && selectedUser) {
      const room = getRoomName(username, selectedUser)
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      const msgData = { username, message, room, timestamp }
      socket.emit("private_message", msgData)
      setMessage("")
    }
  }

  const handleTyping = () => {
    if (selectedUser) {
      const room = getRoomName(username, selectedUser)
      socket.emit("typing", { room, username })
    }
  }

  const getLastMessage = (user) => {
    const room = getRoomName(username, user)
    const messages = chats[room] || []
    return messages.length > 0 ? messages[messages.length - 1] : null
  }

  const selectUserMobile = (user) => {
    setSelectedUser(user);
    setShowConversation(true);

    // Clear dot
    setUnreadMessages((prev) => ({
      ...prev,
      [user]: 0,
    }));

    // Let backend know
    socket.emit("active_chat", {
      currentUser: username,
      chatWith: user,
    });
  };

  // Update the chat footer to match the image style
  const renderChatFooter = () => (
    <div className="chat-footer-unified">
      <div className="emoji-wrapper">
        <button className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
          😊
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker">
            <EmojiPicker
              theme="dark"
              onEmojiClick={(emojiData) => {
                setMessage((prev) => prev + emojiData.emoji)
              }}
            />
          </div>
        )}
      </div>

      {/* 📎 Attachment button */}
      <div className="attach-wrapper">
        <label htmlFor="file-upload" className="attach-btn">📎</label>
        <input
          type="file"
          id="file-upload"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files[0]
            if (!file || !selectedUser) return

            const formData = new FormData()
            formData.append('file', file)

            try {
              const res = await fetch('http://192.168.100.160:5000/upload', {
                method: 'POST',
                body: formData,
              })

              const data = await res.json()

              const room = getRoomName(username, selectedUser)
              const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

              const fileMsg = {
                username,
                message: `📎 ${file.name}`,
                room,
                timestamp,
                fileUrl: data.fileUrl, // ← full URL returned by backend
              }

              socket.emit('private_message', fileMsg)
            } catch (err) {
              console.error('Upload failed:', err)
              alert('Upload failed')
            }
          }}
        />
      </div>

      <input
        type="text"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          handleTyping()
        }}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
      <button className="send-btn" onClick={sendMessage}>
        ➤
      </button>
    </div>



  )

  // Update the mobile chat footer to match the image style
  const renderMobileChatFooter = () => (
    <div className="chat-footer-unified">
      <div className="emoji-wrapper">
        <button className="emoji-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
          😊
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker">
            <EmojiPicker
              theme="dark"
              onEmojiClick={(emojiData) => {
                setMessage((prev) => prev + emojiData.emoji)
              }}
            />
          </div>
        )}
      </div>

      {/* 📎 Attachment button */}
      <div className="attach-wrapper">
        <label htmlFor="file-upload" className="attach-btn">📎</label>
        <input
          type="file"
          id="file-upload"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files[0]
            if (!file || !selectedUser) return

            const formData = new FormData()
            formData.append('file', file)

            try {
              const res = await fetch('http://192.168.100.160:5000/upload', {
                method: 'POST',
                body: formData,
              })

              const data = await res.json()

              const room = getRoomName(username, selectedUser)
              const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

              const fileMsg = {
                username,
                message: `📎 ${file.name}`,
                room,
                timestamp,
                fileUrl: data.fileUrl, // ← full URL returned by backend
              }

              socket.emit('private_message', fileMsg)
            } catch (err) {
              console.error('Upload failed:', err)
              alert('Upload failed')
            }
          }}
        />
      </div>


      <input
        type="text"
        placeholder="Type a message..."
        value={message}
        onChange={(e) => {
          setMessage(e.target.value)
          handleTyping()
        }}
        onKeyDown={(e) => e.key === "Enter" && sendMessage()}
      />
      <button className="send-btn" onClick={sendMessage}>
        ➤
      </button>
    </div>



  )

  return (
    <div className="app">
      {!isLoggedIn ? (
        <div className="auth-container">
          <div className="auth-box">
            <h2 className="auth-title">Sign in to ⚠️NightTalk</h2>
            {formError && <p className="error-msg">{formError}</p>}
            <div className="input-group">
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="input-group">
              <input
                type="text"
                placeholder="Username (min 4 characters)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="input-group">
              <input
                type="password"
                placeholder="Password (min 4 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button onClick={loginUser} className="primary-btn">
              Sign In
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Layout */}
          <div className="messenger-layout">
            {/* Navigation Sidebar */}
            {/* <div className="nav-sidebar">
              <div className="nav-logo">
                <svg viewBox="0 0 36 36" fill="url(#jsc_s_b)" height="40" width="40">
                  <defs>
                    <linearGradient x1="50%" x2="50%" y1="97.0782%" y2="0%" id="jsc_s_b">
                      <stop offset="0%" stopColor="#0062E0"></stop>
                      <stop offset="100%" stopColor="#19AFFF"></stop>
                    </linearGradient>
                  </defs>
                  <path d="M15 35.8C6.5 34.3 0 26.9 0 18 0 8.1 8.1 0 18 0s18 8.1 18 18c0 8.9-6.5 16.3-15 17.8l-1-.8h-4l-1 .8z"></path>
                  <path
                    fill="#FFFFFF"
                    d="M25 23l.8-5H21v-3.5c0-1.4.5-2.5 2.7-2.5H26V7.4c-1.3-.2-2.7-.4-4-.4-4.1 0-7 2.5-7 7v4h-4.5v5H15v12.7c1 .2 2 .3 3 .3s2-.1 3-.3V23h4z"
                  ></path>
                </svg>
              </div>
              <div className="nav-items">
                <div className="nav-item active">
                  <svg viewBox="0 0 28 28" height="28" width="28">
                    <path
                      d="M14 2.042c6.76 0 12 4.952 12 11.64S20.76 25.322 14 25.322a13.091 13.091 0 01-3.474-.461.956 .956 0 00-.641.047L7.5 25.959a.961.961 0 01-1.348-.849l-.065-2.134a.957 .957 0 00-.322-.684A11.389 11.389 0 012 13.682C2 6.994 7.24 2.042 14 2.042zM6.794 17.086a.57.57 0 00.827.758l3.786-2.874a.722.722 0 01.868 0l2.8 2.1a1.8 1.8 0 002.6-.481l3.525-5.592a.57.57 0 00-.827-.758l-3.786 2.874a.722.722 0 01-.868 0l-2.8-2.1a1.8 1.8 0 00-2.6.481l-3.525 5.592z"
                      fill="#0084ff"
                    ></path>
                  </svg>
                </div>
                <div className="nav-item">
                  <svg viewBox="0 0 28 28" height="28" width="28">
                    <path
                      d="M7.847 23.488C9.207 23.488 11.443 23.363 14.467 22.806 13.944 24.228 12.581 25.247 10.98 25.247 9.649 25.247 8.483 24.542 7.825 23.488L7.847 23.488ZM24.923 15.73C25.17 17.002 24.278 18.127 22.27 19.076 21.17 19.595 18.724 20.583 14.684 21.369 11.568 21.974 9.285 22.113 7.848 22.113 7.421 22.113 7.068 22.101 6.79 22.085 4.574 21.958 3.324 21.248 3.077 19.976 2.702 18.049 3.295 17.305 4.278 16.073L4.537 15.748C5.2 14.907 5.459 14.081 5.035 11.902 4.086 7.022 6.284 3.687 11.064 2.753 15.846 1.83 19.134 4.096 20.083 8.977 20.506 11.156 21.056 11.824 21.986 12.355L21.986 12.356 22.348 12.561C23.72 13.335 24.548 13.802 24.923 15.73Z"
                      fill="currentColor"
                    ></path>
                  </svg>
                </div>
                <div className="nav-item">
                  <svg viewBox="0 0 28 28" height="28" width="28">
                    <path
                      d="M17.5 23.75 21.75 23.75C22.164 23.75 22.5 23.414 22.5 23L22.5 14 22.531 14C22.364 13.917 22.206 13.815 22.061 13.694L21.66 13.359C21.567 13.283 21.433 13.283 21.34 13.36L21.176 13.497C20.591 13.983 19.855 14.25 19.095 14.25L18.869 14.25C18.114 14.25 17.382 13.987 16.8 13.506L16.616 13.354C16.523 13.278 16.39 13.278 16.298 13.354L16.113 13.507C15.53 13.987 14.798 14.25 14.044 14.25L13.907 14.25C13.162 14.25 12.439 13.994 11.861 13.525L11.645 13.35C11.552 13.275 11.419 13.276 11.328 13.352L11.155 13.497C10.57 13.984 9.834 14.25 9.074 14.25L8.896 14.25C8.143 14.25 7.414 13.989 6.832 13.511L6.638 13.351C6.545 13.275 6.413 13.275 6.32 13.351L5.849 13.739C5.726 13.84 5.592 13.928 5.452 14L5.5 14 5.5 23C5.5 23.414 5.836 23.75 6.25 23.75L10.5 23.75 10.5 17.5C10.5 16.81 11.06 16.25 11.75 16.25L16.25 16.25C16.94 16.25 17.5 16.81 17.5 17.5L17.5 23.75Z"
                      fill="currentColor"
                    ></path>
                    <path
                      d="M3.673 8.75 24.327 8.75C24.3 8.66 24.271 8.571 24.238 8.483L23.087 5.355C22. 823 4.688 22.178 4.25 21.461 4.25L6.54 4.25C5.822 4.25 5.177 4.688 4.919 5.338L3.762 8.483C3.729 8.571 3.7 8.66 3.673 8.75ZM24.5 10.25 3.5 10.25 3.5 12C3.5 12.414 3.836 12.75 4.25 12.75L4.421 12.75C4.595 12.75 4.763 12.69 4.897 12.58L5.368 12.193C6.013 11.662 6.945 11.662 7.59 12.193L7.784 12.352C8.097 12.609 8.49 12.75 8.896 12.75L9.074 12.75C9.483 12.75 9.88 12.607 10.194 12.345L10.368 12.2C11.01 11.665 11.941 11.659 12.589 12.185L12.805 12.359C13.117 12.612 13.506 12.75 13.907 12.75L14.044 12.75C14.45 12.75 14.844 12.608 15.158 12.35L15.343 12.197C15.989 11.663 16.924 11.663 17.571 12.197L17.755 12.35C18.068 12.608 18.462 12.75 18.869 12.75L19.095 12.75C19.504 12.75 19.901 12.606 20.216 12.344L20.38 12.208C21.028 11.666 21.972 11.666 22.62 12.207L23.022 12.542C23.183 12.676 23.387 12.75 23.598 12.75 24.097 12.75 24.5 12.347 24.5 11.85L24.5 10.25Z"
                      fill="currentColor"
                    ></path>
                  </svg>
                </div>
              </div>
              <div className="nav-profile" onClick={logout}>
                <div className="user-avatar">{username.charAt(0).toUpperCase()}</div>
              </div>
            </div> */}

            {/* Users Sidebar */}
            <div className="users-sidebar">
              <div className="sidebar-header">
                <h2>⚠️NightTalk</h2>
                <div className="header-actions">
                  <button className="icon-btn">
                    <svg viewBox="0 0 20 20" height="20" width="20">
                      <path
                        d="M17.72 4.72a.75.75 0 1 0-1.06-1.06L10 10.94 3.34 4.28a.75.75 0 0 0-1.06 1.06L8.94 12l-6.66 6.66a.75.75 0 1 0 1.06 1.06L10 13.06l6.66 6.66a.75.75 0 1 0 1.06-1.06L11.06 12l6.66-6.66z"
                        fill="currentColor"
                      ></path>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="search-bar">
                <div className="search-input-wrapper">
                  <svg viewBox="0 0 16 16" height="16" width="16" className="search-icon">
                    <path
                      d="M15.25 14.584l-3.526-3.526a6.5 6.5 0 10-.672.672l3.526 3.526a.5.5 0 00.672-.672zM6.5 12a5.5 5.5 0 115.5-5.5 5.5 5.5 0 01-5.5 5.5z"
                      fill="currentColor"
                    ></path>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search Messenger"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="users-list">
                {onlineUsers
                  .filter((u) => u !== username && u.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((user, idx) => {
                    const lastMsg = getLastMessage(user)
                    const hasUnread = unreadMessages[user] > 0
                    return (
                      <div
                        key={idx}
                        className={`user-item ${selectedUser === user ? "selected" : ""}`}
                        onClick={() => selectUser(user)} // ✅ use selectUser to clear dot
                      >
                        <div className="user-avatar">
                          {user.charAt(0).toUpperCase()}
                          {hasUnread && <span className="dot-inside-avatar" />}
                        </div>
                        <div className="user-info">
                          <div className="user-name">{user}</div>
                          <div className="user-last-message">
                            {lastMsg
                              ? `${lastMsg.username === username ? "You: " : ""}${lastMsg.message.substring(0, 30)}${lastMsg.message.length > 30 ? "..." : ""
                              }`
                              : "Start a new conversation"}
                          </div>
                        </div>
                        {lastMsg && <div className="user-time">{lastMsg.timestamp}</div>}
                      </div>
                    )
                  })}
                {onlineUsers.filter((u) => u !== username && u.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                  <p className="no-users">No users found</p>
                )}
              </div>
            </div>
            {/* Chat Area */}
            <div className="chat-area">
              {selectedUser ? (
                <>
                  <div className="chat-header">
                    <div className="chat-user">
                      <div className="user-avatar">{selectedUser.charAt(0).toUpperCase()}</div>
                      <div className="user-info">
                        <div className="user-name">{selectedUser}</div>
                        <div className="user-status">Active Now</div>
                      </div>
                    </div>
                    <div className="chat-actions">
                      <button className="icon-btn">
                        <svg viewBox="0 0 36 36" height="20" width="20">
                          <path d="M18 10a8 8 0 100 16 8 8 0 000-16z" fill="currentColor"></path>
                        </svg>
                      </button>
                      <button className="icon-btn">
                        <svg viewBox="0 0 36 36" height="20" width="20">
                          <path d="M18 10a8 8 0 100 16 8 8 0 000-16z" fill="currentColor"></path>
                        </svg>
                      </button>
                      <button className="icon-btn">
                        <svg viewBox="0 0 36 36" height="20" width="20">
                          <path d="M18 10a8 8 0 100 16 8 8 0 000-16z" fill="currentColor"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="messages-container">
                    <div className="messages">
                      {(chats[getRoomName(username, selectedUser)] || []).map((msg, idx) => (
                        <div key={idx} className={`msg ${msg.username === username ? "own" : "other"}`}>
                          {msg.username !== username && (
                            <div className="msg-avatar">{msg.username.charAt(0).toUpperCase()}</div>
                          )}
                          <div className="msg-content">
                            <div
                              className={`bubble ${msg.fileUrl && msg.fileUrl.match(/\.(jpeg|jpg|png|gif|png)$/i)
                                ? 'image-bubble'
                                : ''
                                }`}
                            >
                              {msg.fileUrl ? (
                                msg.fileUrl.match(/\.(jpeg|jpg|png|gif|png)$/i) ? (
                                  <img
                                    src={msg.fileUrl}
                                    alt="attachment"
                                    style={{ maxWidth: '200px', borderRadius: '8px' }}
                                  />
                                ) : (
                                  <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                                    {msg.message}
                                  </a>
                                )
                              ) : (
                                msg.message
                              )}
                            </div>
                            <div className="timestamp">{msg.timestamp}</div>
                          </div>

                          {/* {msg.username === username && (
                            <div className="msg-avatar own-avatar">{msg.username.charAt(0).toUpperCase()}</div>
                          )} */}
                        </div>
                      ))}
                      <div ref={messagesEndRef}></div>
                    </div>
                    {typingStatus && <div className="typing-indicator">{typingStatus}</div>}
                  </div>
                  {renderChatFooter()}
                </>
              ) : (
                <div className="no-chat">
                  <div className="no-chat-content">
                    <svg viewBox="0 0 80 80" height="80" width="80">
                      <path d="M40 0C17.909 0 0 17.909 0 40s17.909 40 40 40 40-17.909 40-40S62.091 0 40 0zm0 75c-19.33 0-35-15.67-35-35s15.67-35 35-35 35 15.67 35 35-15.67 35-35 35zm17.013-55.013c-9.335-9.335-24.691-9.335-34.026 0-9.335 9.335-9.335 24.691 0 34.026 9.335 9.335 24.691 9.335 34.026 0 9.335-9.335 9.335-24.691 0-34.026z"
                        fill="#BCC0C4">
                      </path>
                      <path d="M40 10c-16.569 0-30 13.431-30 30 0 16.569 13.431 30 30 30 16.569 0 30-13.431 30-30 0-16.569-13.431-30-30-30zm-3 45H25V25h12v30zm18 0H43V25h12v30z"
                        fill="#BCC0C4">
                      </path>
                    </svg>
                    <h3>Select a chat to start messaging</h3>
                  </div>
                </div>)}
            </div>
          </div>
          {/* Mobile View */}
          <div className="mobile-view">
            {!showConversation || !selectedUser ? (
              <div className="mobile-chat-list">
                <div className="mobile-header">
                  <div className="mobile-user-profile">
                    <div className="user-avatar">{username.charAt(0).toUpperCase()}</div>
                  </div>
                  <div className="mobile-title">⚠️NightTalk</div>
                  <div className="mobile-actions">
                    <svg viewBox="0 0 20 20" height="20" width="20">
                      <path d="M10 14" fill="currentColor"></path>
                    </svg>
                  </div>
                </div>
                <div className="mobile-search-bar">
                  <div className="search-input-wrapper">
                    <svg viewBox="0 0 16 16" height="16" width="16" className="search-icon">
                      <path
                        d="M15.25 14.584l-3.526-3.526a6.5 6.5 0 10-.672.672l3.526 3.526a.5.5 0 00.672-.672zM6.5 12a5.5 5.5 0 115.5-5.5 5.5 5.5 0 01-5.5 5.5z"
                        fill="currentColor"
                      ></path>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mobile-chats">
                  {onlineUsers
                    .filter((u) => u !== username && u.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((user, idx) => {
                      const lastMsg = getLastMessage(user)
                      return (
                        <div key={idx} className="user-item" onClick={() => selectUserMobile(user)}>
                          <div className="user-avatar">{user.charAt(0).toUpperCase()}</div>
                          <div className="user-info">
                            <div className="user-name">{user}</div>
                            <div className="user-last-message">
                              {lastMsg
                                ? `${lastMsg.username === username ? "You: " : ""}${lastMsg.message.substring(0, 30)}${lastMsg.message.length > 30 ? "..." : ""
                                }`
                                : "Start a new conversation"}
                            </div>
                          </div>
                          {lastMsg && <div className="user-time">{lastMsg.timestamp}</div>}
                          {unreadMessages[user] > 0 && (
                            <div className="notification-badge">{unreadMessages[user]}</div>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            ) : (
              <div className="mobile-conversation">
                <div className="mobile-chat-header">
                  <button className="back-button" onClick={() => {
                    setShowConversation(false);
                    setSelectedUser(null);
                  }}>
                    <svg viewBox="0 0 20 20" height="20" width="20">
                      <path d="M12.2 4.53 6.727 10l5.47 5.47a.75.75 0 0 1-1.061 1.06l-6-6a.751.751 0 0 1 0-1.06l6-6A.75.75 0 1 1 12.2 4.53z" fill="currentColor">
                      </path>
                    </svg>
                  </button>
                  <div className="mobile-chat-user">
                    <div className="user-avatar">{selectedUser.charAt(0).toUpperCase()}</div>
                    <div className="user-info">
                      <div className="user-name">{selectedUser}</div>
                      <div className="user-status">Active now</div>
                    </div>
                  </div>
                </div>

                <div className="mobile-messages-container">
                  <div className="messages">
                    {username && selectedUser && chats[getRoomName(username, selectedUser)]?.map((msg, idx) => (
                      <div key={idx} className={`msg ${msg.username === username ? "own" : "other"}`}>
                        {msg.username !== username && (
                          <div className="msg-avatar">{msg.username.charAt(0).toUpperCase()}</div>
                        )}
                        <div className="msg-content">
                          <div
                            className={`bubble ${msg.fileUrl && msg.fileUrl.match(/\.(jpeg|jpg|png|gif|png)$/i)
                                ? 'image-bubble'
                                : ''
                              }`}
                          >
                            {msg.fileUrl ? (
                              msg.fileUrl.match(/\.(jpeg|jpg|png|gif|png)$/i) ? (
                                <img
                                  src={msg.fileUrl}
                                  alt="attachment"
                                  style={{ maxWidth: '200px', borderRadius: '8px' }}
                                />
                              ) : (
                                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer">
                                  {msg.message}
                                </a>
                              )
                            ) : (
                              msg.message
                            )}
                          </div>
                          <div className="timestamp">{msg.timestamp}</div>
                        </div>

                      </div>
                    ))}
                    <div ref={messagesEndRef}></div>
                  </div>
                  {typingStatus && <div className="typing-indicator">{typingStatus}</div>}
                </div>

                {renderMobileChatFooter()}
              </div>
            )}
          </div>

        </>
      )}
    </div>
  )
}

export default App

