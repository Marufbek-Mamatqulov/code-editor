import React, { useState } from 'react'
import './CodeEditor.css'

type Language = 'html' | 'js' | 'react' | 'vue' | 'typescript' | 'sql'

const defaults: Record<Language, string> = {
  html: `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <title>Mening sahifam</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background: #f0f4ff;
    }
    h1 {
      color: #4f46e5;
      font-size: 2rem;
    }
  </style>
</head>
<body>
  <h1>Salom, Dunyo! 👋</h1>
</body>
</html>`,
  
  js: `// JavaScript misoli
const numbers = [1, 2, 3, 4, 5];

const doubled = numbers.map(n => n * 2);
console.log("Ikkilangan:", doubled);

const sum = numbers.reduce((a, b) => a + b, 0);
console.log("Yig'indisi:", sum);

if (sum > 10) {
  console.log("Yig'indi 10 dan katta!");
} else {
  console.warn("Yig'indi 10 dan kichik.");
}`,
  
  react: `import React, { useState } from 'react'

export default function App() {
  const [count, setCount] = useState(0)
  
  return (
    <div style={{padding: '20px', textAlign: 'center'}}>
      <h1>React Counter</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>
        Ortirish
      </button>
    </div>
  )
}`,
  
  vue: `<template>
  <div style="padding: 20px; text-align: center">
    <h1>Vue Counter</h1>
    <p>Count: {{ count }}</p>
    <button @click="count++">
      Ortirish
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'
const count = ref(0)
</script>`,
  
  typescript: `// TypeScript misoli
interface User {
  name: string
  age: number
  email: string
}

const users: User[] = [
  { name: 'Ali', age: 25, email: 'ali@example.com' },
  { name: 'Fatima', age: 30, email: 'fatima@example.com' }
]

console.log(users)
console.log('Foydalanuvchilar soni:', users.length)`,
  
  sql: `-- SQL misoli
SELECT * FROM users WHERE age > 25;

CREATE TABLE students (
  id INT PRIMARY KEY,
  name VARCHAR(100),
  age INT,
  email VARCHAR(100)
);

INSERT INTO students VALUES (1, 'Karim', 22, 'karim@example.com');

UPDATE students SET age = 23 WHERE id = 1;

DELETE FROM students WHERE age < 18;`
}

const CodeEditor: React.FC = () => {
  const [currentLang, setCurrentLang] = useState<Language>('html')
  const [code, setCode] = useState(defaults.html)
  const [output, setOutput] = useState<any[]>([])
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')

  const handleLangChange = (lang: Language) => {
    setCurrentLang(lang)
    setCode(defaults[lang])
    setOutput([])
    setStatus('idle')
  }

  const runCode = () => {
    if (!code.trim()) return

    if (currentLang === 'html') {
      runHTML()
    } else if (currentLang === 'js') {
      runJS()
    } else if (currentLang === 'typescript') {
      runJS() // TypeScript-ni JavaScript sifatida ishga tushiramiz
    } else {
      // Boshqa tillar uchun demo natija
      runDemo()
    }
  }

  const runHTML = () => {
    setStatus('running')
    const iframe = document.getElementById('preview-frame') as HTMLIFrameElement
    if (iframe) {
      iframe.srcdoc = code
      iframe.onload = () => setStatus('success')
      iframe.onerror = () => setStatus('error')
    }
  }

  const runJS = () => {
    setStatus('running')
    const logs: any[] = []
    
    const origLog = console.log
    const origWarn = console.warn
    const origError = console.error

    console.log = (...args: any[]) => {
      logs.push({ type: 'log', text: args.map(a => JSON.stringify(a, null, 2)).join(' ') })
      origLog(...args)
    }
    console.warn = (...args: any[]) => {
      logs.push({ type: 'warn', text: args.map(a => JSON.stringify(a, null, 2)).join(' ') })
      origWarn(...args)
    }
    console.error = (...args: any[]) => {
      logs.push({ type: 'error', text: args.map(a => JSON.stringify(a, null, 2)).join(' ') })
      origError(...args)
    }

    try {
      new Function(code)()
      setStatus('success')
    } catch (err: any) {
      logs.push({ type: 'error', text: '⛔ ' + err.toString() })
      setStatus('error')
    } finally {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
    }

    setOutput(logs)
  }

  const runDemo = () => {
    setStatus('success')
    setOutput([
      { type: 'log', text: `Kod to'g'ri ko'rsatildi (${currentLang} demo)` },
      { type: 'log', text: 'Natija konsolda chiqadi' }
    ])
  }

  const clearEditor = () => {
    setCode('')
    setOutput([])
    setStatus('idle')
  }

  return (
    <div className="editor-wrap">
      {/* Toolbar */}
      <div className="toolbar">
        <span className="lang-badge">{currentLang.toUpperCase()}</span>
        <select value={currentLang} onChange={(e) => handleLangChange(e.target.value as Language)}>
          <option value="html">HTML / CSS</option>
          <option value="js">JavaScript</option>
          <option value="react">React</option>
          <option value="vue">Vue</option>
          <option value="typescript">TypeScript</option>
          <option value="sql">SQL</option>
        </select>
        <div className="spacer"></div>
        <button className="btn-clear" onClick={clearEditor}>Tozalash</button>
        <button className="btn-run" onClick={runCode}>▶ Ishga tushirish</button>
      </div>

      {/* Code area */}
      <div className="code-area">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Kodingizni shu yerga yozing..."
          spellCheck="false"
        />
      </div>

      {/* Output section */}
      <div className="output-section">
        <div className="output-header">
          <span>
            <span className={`status-dot ${status}`}></span>
            <span className="output-label">Natija</span>
          </span>
          <span className="status-text">
            {status === 'idle' && 'Hali ishga tushirilmagan'}
            {status === 'running' && 'Ishga tushirilmoqda...'}
            {status === 'success' && 'Muvaffaqiyatli'}
            {status === 'error' && 'Xatolik yuz berdi'}
          </span>
        </div>

        {currentLang === 'html' ? (
          <iframe id="preview-frame" className="preview-frame" />
        ) : (
          <div className="js-output">
            {output.length === 0 ? (
              <span className="empty-msg">Hech narsa chiqmadi. console.log() ishlating.</span>
            ) : (
              output.map((log, i) => (
                <div key={i} className={`output-line ${log.type}`}>
                  {log.text}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Hint bar */}
      <div className="hint-bar">
        💡 <strong>Ctrl + Enter</strong> — ishga tushiradi
      </div>
    </div>
  )
}

export default CodeEditor
