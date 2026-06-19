import React, { useState, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import type { OnMount } from '@monaco-editor/react'
import './CodeEditor.css'

// ── Types ──────────────────────────────────────────────────────────────────────
type ExecMode = 'html' | 'js' | 'piston'
type OutputKind = 'log' | 'warn' | 'error' | 'info' | 'stdout' | 'stderr' | 'system'
type RunStatus = 'idle' | 'running' | 'success' | 'error'

interface OutputLine { kind: OutputKind; text: string }

interface LangDef {
  id: string
  label: string
  monacoLang: string
  color: string
  icon: string
  mode: ExecMode
  pistonLang?: string
  defaultCode: string
}

// ── Constants ──────────────────────────────────────────────────────────────────
const PISTON_URL = 'https://emkc.org/api/v2/piston/execute'
const MAX_CODE = 50_000

// Sandboxed JS runner — injected as srcdoc, code sent via postMessage
// split </script> to avoid closing the outer script tag in the srcdoc string
const SANDBOX_HTML =
  `<!DOCTYPE html><html><body><script>` +
  `(function(){` +
  `function fmt(a){return[].slice.call(a).map(function(x){` +
  `if(x===null)return'null';if(x===undefined)return'undefined';` +
  `if(typeof x==='object'){try{return JSON.stringify(x,null,2);}catch(e){return String(x);}}` +
  `return String(x);}).join(' ');}` +
  `var L=console.log,W=console.warn,E=console.error,I=console.info;` +
  `console.log  =function(){parent.postMessage({k:'log',  t:fmt(arguments)},'*');};` +
  `console.warn =function(){parent.postMessage({k:'warn', t:fmt(arguments)},'*');};` +
  `console.error=function(){parent.postMessage({k:'error',t:fmt(arguments)},'*');};` +
  `console.info =function(){parent.postMessage({k:'info', t:fmt(arguments)},'*');};` +
  `window.onerror=function(m,s,l,c){parent.postMessage({k:'error',t:'⛔ '+m+' (satir '+l+')'}, '*');return true;};` +
  `window.addEventListener('message',function(e){` +
  `if(!e.data||e.data.type!=='run')return;` +
  `try{(new Function(e.data.code))();}` +
  `catch(err){parent.postMessage({k:'error',t:'⛔ '+err.toString()},'*');}` +
  `parent.postMessage({type:'done'},'*');});` +
  `parent.postMessage({type:'ready'},'*');` +
  `})();` +
  `<` + `/script></body></html>`

// ── Language definitions ───────────────────────────────────────────────────────
const LANGS: LangDef[] = [
  {
    id: 'html', label: 'HTML/CSS', monacoLang: 'html', color: '#e34c26', icon: '🌐', mode: 'html',
    defaultCode: `<!DOCTYPE html>
<html lang="uz">
<head>
  <meta charset="UTF-8">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea, #764ba2);
    }
    .card {
      background: white;
      padding: 40px 50px;
      border-radius: 20px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.25);
    }
    h1 { color: #4f46e5; font-size: 2rem; margin-bottom: 8px; }
    p  { color: #6b7280; margin-bottom: 24px; }
    .count { font-size: 3.5rem; font-weight: 700; color: #4f46e5; margin: 16px 0; }
    .btns { display: flex; gap: 10px; justify-content: center; }
    button {
      padding: 10px 24px;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      cursor: pointer;
      font-weight: 600;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.85; }
    .inc { background: #4f46e5; color: white; }
    .dec { background: #f3f4f6; color: #374151; }
    .rst { background: #fee2e2; color: #dc2626; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Salom, Dunyo! 👋</h1>
    <p>HTML + CSS + JavaScript misoli</p>
    <div class="count" id="n">0</div>
    <div class="btns">
      <button class="dec" onclick="update(-1)">−1</button>
      <button class="rst" onclick="update(0,true)">Reset</button>
      <button class="inc" onclick="update(1)">+1</button>
    </div>
  </div>
  <script>
    var n = 0;
    function update(d, reset) {
      n = reset ? 0 : n + d;
      document.getElementById('n').textContent = n;
    }
  </script>
</body>
</html>`,
  },
  {
    id: 'javascript', label: 'JavaScript', monacoLang: 'javascript', color: '#f7df1e', icon: '🟨', mode: 'js',
    defaultCode: `// JavaScript — massivlar, funksiyalar, ES6+

const students = [
  { name: 'Ali',    grade: 85 },
  { name: 'Fatima', grade: 92 },
  { name: 'Jasur',  grade: 78 },
  { name: 'Malika', grade: 95 },
  { name: 'Bobur',  grade: 67 },
];

const status = g => g >= 90 ? "A'lo" : g >= 75 ? "Yaxshi" : "Qoniqarli";
const avg = students.reduce((s, x) => s + x.grade, 0) / students.length;

console.log(\`O'rtacha ball: \${avg.toFixed(1)}\`);
console.log('');
console.log('Reyting:');

[...students]
  .sort((a, b) => b.grade - a.grade)
  .forEach((s, i) =>
    console.log(\`  \${i + 1}. \${s.name.padEnd(8)} \${s.grade}  (\${status(s.grade)})\`)
  );`,
  },
  {
    id: 'typescript', label: 'TypeScript', monacoLang: 'typescript', color: '#3178c6', icon: '🔷', mode: 'piston', pistonLang: 'typescript',
    defaultCode: `// TypeScript — interfeyslar va generiklar

interface Student {
  name: string;
  grade: number;
}

const status = (g: number): string =>
  g >= 90 ? "A'lo" : g >= 75 ? "Yaxshi" : "Qoniqarli";

function topStudents<T extends Student>(list: T[], min: number): T[] {
  return [...list].filter(s => s.grade >= min).sort((a, b) => b.grade - a.grade);
}

const students: Student[] = [
  { name: 'Ali',    grade: 85 },
  { name: 'Fatima', grade: 92 },
  { name: 'Jasur',  grade: 78 },
  { name: 'Malika', grade: 95 },
];

const avg = students.reduce((s, x) => s + x.grade, 0) / students.length;
console.log(\`O'rtacha ball: \${avg.toFixed(1)}\\n\`);

console.log('75+ ball olganlar:');
topStudents(students, 75).forEach((s, i) =>
  console.log(\`  \${i + 1}. \${s.name.padEnd(8)} \${s.grade}  (\${status(s.grade)})\`)
);`,
  },
  {
    id: 'python', label: 'Python', monacoLang: 'python', color: '#3572a5', icon: '🐍', mode: 'piston', pistonLang: 'python',
    defaultCode: `# Python — algoritmlar va ro'yxatlar

def bubble_sort(arr):
    a = arr[:]
    for i in range(len(a)):
        for j in range(len(a) - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
    return a

def status(g):
    if g >= 90: return "A'lo"
    if g >= 75: return "Yaxshi"
    return "Qoniqarli"

students = [
    ('Ali', 85), ('Fatima', 92), ('Jasur', 78),
    ('Malika', 95), ('Bobur', 67),
]

grades = [g for _, g in students]
print(f"Boshlang'ich:  {grades}")
print(f"Tartiblangan:  {bubble_sort(grades)}")

avg = sum(grades) / len(grades)
print(f"\\nO'rtacha ball: {avg:.1f}\\n")

print("Reyting:")
for i, (name, g) in enumerate(sorted(students, key=lambda x: -x[1]), 1):
    print(f"  {i}. {name:<8} {g}  ({status(g)})")`,
  },
  {
    id: 'java', label: 'Java', monacoLang: 'java', color: '#b07219', icon: '☕', mode: 'piston', pistonLang: 'java',
    defaultCode: `import java.util.*;

public class Main {
    record Student(String name, int grade) {
        String status() {
            if (grade >= 90) return "A'lo";
            if (grade >= 75) return "Yaxshi";
            return "Qoniqarli";
        }
    }

    public static void main(String[] args) {
        var students = new ArrayList<>(List.of(
            new Student("Ali",    85),
            new Student("Fatima", 92),
            new Student("Jasur",  78),
            new Student("Malika", 95),
            new Student("Bobur",  67)
        ));

        double avg = students.stream()
            .mapToInt(Student::grade).average().orElse(0);
        System.out.printf("O'rtacha ball: %.1f%n%n", avg);

        students.sort(Comparator.comparingInt(Student::grade).reversed());

        System.out.println("Reyting:");
        for (int i = 0; i < students.size(); i++) {
            var s = students.get(i);
            System.out.printf("  %d. %-8s %d  (%s)%n",
                i + 1, s.name(), s.grade(), s.status());
        }
    }
}`,
  },
  {
    id: 'c', label: 'C', monacoLang: 'c', color: '#555555', icon: '⚙️', mode: 'piston', pistonLang: 'c',
    defaultCode: `#include <stdio.h>
#include <math.h>

int is_prime(int n) {
    if (n < 2) return 0;
    for (int i = 2; i <= (int)sqrt(n); i++)
        if (n % i == 0) return 0;
    return 1;
}

void bubble_sort(int *a, int n) {
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - i - 1; j++)
            if (a[j] > a[j+1]) {
                int t = a[j]; a[j] = a[j+1]; a[j+1] = t;
            }
}

int main() {
    printf("1-50 tub sonlar: ");
    for (int i = 2; i <= 50; i++)
        if (is_prime(i)) printf("%d ", i);
    printf("\\n");

    int arr[] = {64, 34, 25, 12, 22, 11, 90};
    int n = sizeof(arr) / sizeof(arr[0]);

    printf("\\nBoshlang'ich: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);

    bubble_sort(arr, n);

    printf("\\nTartiblangan: ");
    for (int i = 0; i < n; i++) printf("%d ", arr[i]);
    printf("\\n");

    return 0;
}`,
  },
  {
    id: 'cpp', label: 'C++', monacoLang: 'cpp', color: '#f34b7d', icon: '🔩', mode: 'piston', pistonLang: 'c++',
    defaultCode: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

struct Student {
    string name;
    int grade;
    string status() const {
        if (grade >= 90) return "A'lo";
        if (grade >= 75) return "Yaxshi";
        return "Qoniqarli";
    }
};

int main() {
    vector<Student> students = {
        {"Ali", 85}, {"Fatima", 92}, {"Jasur", 78},
        {"Malika", 95}, {"Bobur", 67}
    };

    double avg = 0;
    for (auto& s : students) avg += s.grade;
    avg /= students.size();
    cout << "O'rtacha ball: " << avg << "\\n\\n";

    sort(students.begin(), students.end(),
        [](const Student& a, const Student& b){ return a.grade > b.grade; });

    cout << "Reyting:\\n";
    for (int i = 0; i < (int)students.size(); i++) {
        auto& s = students[i];
        string pad(8 - s.name.size(), ' ');
        cout << "  " << i+1 << ". " << s.name << pad
             << s.grade << "  (" << s.status() << ")\\n";
    }
    return 0;
}`,
  },
  {
    id: 'go', label: 'Go', monacoLang: 'go', color: '#00add8', icon: '🔵', mode: 'piston', pistonLang: 'go',
    defaultCode: `package main

import (
    "fmt"
    "sort"
    "strings"
)

type Student struct {
    Name  string
    Grade int
}

func status(g int) string {
    switch {
    case g >= 90: return "A'lo"
    case g >= 75: return "Yaxshi"
    default:      return "Qoniqarli"
    }
}

func main() {
    students := []Student{
        {"Ali", 85}, {"Fatima", 92}, {"Jasur", 78},
        {"Malika", 95}, {"Bobur", 67},
    }

    total := 0
    for _, s := range students { total += s.Grade }
    fmt.Printf("O'rtacha ball: %.1f\\n\\n", float64(total)/float64(len(students)))

    sort.Slice(students, func(i, j int) bool {
        return students[i].Grade > students[j].Grade
    })

    fmt.Println("Reyting:")
    for i, s := range students {
        pad := strings.Repeat(" ", 8-len(s.Name))
        fmt.Printf("  %d. %s%s%d  (%s)\\n", i+1, s.Name, pad, s.Grade, status(s.Grade))
    }
}`,
  },
  {
    id: 'rust', label: 'Rust', monacoLang: 'rust', color: '#dea584', icon: '🦀', mode: 'piston', pistonLang: 'rust',
    defaultCode: `fn status(g: i32) -> &'static str {
    match g {
        90..=100 => "A'lo",
        75..=89  => "Yaxshi",
        _        => "Qoniqarli",
    }
}

fn main() {
    let mut students = vec![
        ("Ali",    85i32),
        ("Fatima", 92),
        ("Jasur",  78),
        ("Malika", 95),
        ("Bobur",  67),
    ];

    let avg: f64 = students.iter().map(|s| s.1 as f64).sum::<f64>()
        / students.len() as f64;
    println!("O'rtacha ball: {avg:.1}\\n");

    students.sort_unstable_by(|a, b| b.1.cmp(&a.1));

    println!("Reyting:");
    for (i, (name, grade)) in students.iter().enumerate() {
        println!("  {}. {:<8} {}  ({})", i + 1, name, grade, status(*grade));
    }
}`,
  },
  {
    id: 'php', label: 'PHP', monacoLang: 'php', color: '#4f5d95', icon: '🐘', mode: 'piston', pistonLang: 'php',
    defaultCode: `<?php

function status(int $g): string {
    return match(true) {
        $g >= 90 => "A'lo",
        $g >= 75 => "Yaxshi",
        default  => "Qoniqarli",
    };
}

$students = [
    ['name' => 'Ali',    'grade' => 85],
    ['name' => 'Fatima', 'grade' => 92],
    ['name' => 'Jasur',  'grade' => 78],
    ['name' => 'Malika', 'grade' => 95],
    ['name' => 'Bobur',  'grade' => 67],
];

$avg = array_sum(array_column($students, 'grade')) / count($students);
printf("O'rtacha ball: %.1f\\n\\n", $avg);

usort($students, fn($a, $b) => $b['grade'] - $a['grade']);

echo "Reyting:\\n";
foreach ($students as $i => $s) {
    printf("  %d. %-8s %d  (%s)\\n",
        $i + 1, $s['name'], $s['grade'], status($s['grade']));
}`,
  },
  {
    id: 'ruby', label: 'Ruby', monacoLang: 'ruby', color: '#cc342d', icon: '💎', mode: 'piston', pistonLang: 'ruby',
    defaultCode: `# Ruby — hash va massivlar

def status(g)
  case g
  when 90..100 then "A'lo"
  when 75..89  then "Yaxshi"
  else              "Qoniqarli"
  end
end

students = [
  { name: 'Ali',    grade: 85 },
  { name: 'Fatima', grade: 92 },
  { name: 'Jasur',  grade: 78 },
  { name: 'Malika', grade: 95 },
  { name: 'Bobur',  grade: 67 },
]

avg = students.sum { |s| s[:grade] }.to_f / students.size
printf("O'rtacha ball: %.1f\\n\\n", avg)

puts "Reyting:"
students.sort_by { |s| -s[:grade] }.each_with_index do |s, i|
  printf("  %d. %-8s %d  (%s)\\n", i + 1, s[:name], s[:grade], status(s[:grade]))
end`,
  },
  {
    id: 'bash', label: 'Bash', monacoLang: 'shell', color: '#89e051', icon: '📟', mode: 'piston', pistonLang: 'bash',
    defaultCode: `#!/bin/bash
echo "=== Bash misoli ==="

# Massiv bilan ishlash
mevalar=("olma" "banan" "gilos" "uzum" "nok")
echo ""
echo "Mevalar ro'yxati:"
for i in "\${!mevalar[@]}"; do
  echo "  $((i+1)). \${mevalar[i]}"
done

# Arifmetika
echo ""
echo "Kvadratlar jadvali:"
for i in {1..6}; do
  echo "  $i² = $((i * i))"
done

# String operatsiyalari
echo ""
text="Assalomu Alaykum, Dunyo!"
echo "Matn:      $text"
echo "Uzunlik:   \${#text} belgi"
echo "Katta:     \${text^^}"
echo "Kichik:    \${text,,}"

# Shartli ifoda
x=42
if [ $x -gt 40 ]; then
  echo ""
  echo "$x > 40 — to'g'ri!"
fi`,
  },
]

// ── Component ──────────────────────────────────────────────────────────────────
const CodeEditor: React.FC = () => {
  const [lang, setLang] = useState<LangDef>(LANGS[0])
  const [status, setStatus] = useState<RunStatus>('idle')
  const [output, setOutput] = useState<OutputLine[]>([])
  const [stdin, setStdin] = useState('')
  const [execMs, setExecMs] = useState<number | null>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)
  const [runtimeVer, setRuntimeVer] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'output' | 'stdin'>('output')
  const [htmlPreview, setHtmlPreview] = useState('')

  const editorRef = useRef<any>(null)
  const outputEndRef = useRef<HTMLDivElement>(null)

  const scrollOutput = () => {
    setTimeout(() => outputEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handleRun())
    editor.focus()
  }

  const switchLang = (newLang: LangDef) => {
    setLang(newLang)
    editorRef.current?.setValue(newLang.defaultCode)
    setOutput([])
    setStatus('idle')
    setExecMs(null)
    setExitCode(null)
    setRuntimeVer(null)
    setHtmlPreview('')
    setActiveTab('output')
  }

  // ── JS sandbox runner ────────────────────────────────────────────────────────
  const runJS = (code: string, t0: number): Promise<void> =>
    new Promise((resolve) => {
      const lines: OutputLine[] = []
      let settled = false

      const iframe = document.createElement('iframe')
      iframe.setAttribute('sandbox', 'allow-scripts')
      iframe.style.cssText = 'display:none;position:fixed;top:-9999px'
      document.body.appendChild(iframe)

      const finish = () => {
        if (settled) return
        settled = true
        window.removeEventListener('message', onMsg)
        if (document.body.contains(iframe)) document.body.removeChild(iframe)
        const ms = performance.now() - t0
        setOutput(lines)
        setExecMs(ms)
        setExitCode(lines.some(l => l.kind === 'error') ? 1 : 0)
        setStatus(lines.some(l => l.kind === 'error') ? 'error' : 'success')
        scrollOutput()
        resolve()
      }

      const onMsg = (e: MessageEvent) => {
        if (e.source !== iframe.contentWindow) return
        const d = e.data
        if (!d) return
        if (d.type === 'ready') {
          iframe.contentWindow!.postMessage({ type: 'run', code }, '*')
        } else if (d.type === 'done') {
          finish()
        } else if (d.k) {
          lines.push({ kind: d.k as OutputKind, text: d.t })
        }
      }

      window.addEventListener('message', onMsg)
      iframe.srcdoc = SANDBOX_HTML
      setTimeout(() => {
        if (!settled) {
          lines.push({ kind: 'error', text: '⏱ Timeout: kod 5 soniyadan oshdi va to\'xtatildi' })
          finish()
        }
      }, 5000)
    })

  // ── Piston API runner ────────────────────────────────────────────────────────
  const runPiston = async (code: string, t0: number) => {
    const body: Record<string, unknown> = {
      language: lang.pistonLang,
      version: '*',
      files: [{ content: code }],
      compile_timeout: 10000,
      run_timeout: 5000,
    }
    if (stdin.trim()) body.stdin = stdin

    const resp = await fetch(PISTON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const ms = performance.now() - t0

    if (!resp.ok) {
      throw new Error(`Server xatoligi: ${resp.status} — ${resp.statusText}`)
    }

    const data = await resp.json()
    const lines: OutputLine[] = []

    if (data.version) setRuntimeVer(data.version)

    // Compile stage (C, C++, Java, Go, Rust…)
    if (data.compile?.stderr) {
      lines.push({
        kind: 'stderr',
        text: '🔨 Kompilyatsiya xatoligi:\n' + data.compile.stderr.trim(),
      })
    }

    // Run stage
    const run = data.run ?? data
    if (run?.stdout) {
      run.stdout.trimEnd().split('\n').forEach((t: string) =>
        lines.push({ kind: 'stdout', text: t })
      )
    }
    if (run?.stderr) {
      run.stderr.trimEnd().split('\n').forEach((t: string) =>
        lines.push({ kind: 'stderr', text: t })
      )
    }
    if (lines.length === 0) {
      lines.push({ kind: 'system', text: 'Chiqish yo\'q (stdout/stderr bo\'sh)' })
    }

    const code0 = run?.code ?? 0
    const compileErr = data.compile && data.compile.code !== 0

    setOutput(lines)
    setExecMs(ms)
    setExitCode(code0)
    setStatus(compileErr || code0 !== 0 ? 'error' : 'success')
    scrollOutput()
  }

  // ── Main run handler ─────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    const code = (editorRef.current?.getValue() ?? '').trim()
    if (!code || status === 'running') return

    if (code.length > MAX_CODE) {
      setOutput([{ kind: 'error', text: `Kod hajmi chegaradan oshdi (max ${MAX_CODE / 1000}KB)` }])
      setStatus('error')
      return
    }

    setStatus('running')
    setOutput([])
    setExecMs(null)
    setExitCode(null)
    setRuntimeVer(null)
    setActiveTab('output')

    const t0 = performance.now()

    try {
      if (lang.mode === 'html') {
        setHtmlPreview(code)
        setExecMs(performance.now() - t0)
        setStatus('success')
      } else if (lang.mode === 'js') {
        await runJS(code, t0)
      } else {
        await runPiston(code, t0)
      }
    } catch (err: any) {
      setOutput([{ kind: 'error', text: '⛔ ' + (err?.message ?? String(err)) }])
      setStatus('error')
      setExecMs(performance.now() - t0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, status, stdin])

  const copyCode = () => {
    const code = editorRef.current?.getValue() ?? ''
    navigator.clipboard?.writeText(code).catch(() => {})
  }

  const resetCode = () => {
    editorRef.current?.setValue(lang.defaultCode)
    setOutput([])
    setStatus('idle')
    setExecMs(null)
    setExitCode(null)
    setRuntimeVer(null)
    setHtmlPreview('')
  }

  const isHTML = lang.mode === 'html'
  const isJS   = lang.mode === 'js'
  const needsStdin = !isHTML && !isJS

  return (
    <div className="ce-root">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="ce-topbar">
        <div className="ce-logo">
          <span className="ce-logo-bracket">&lt;/&gt;</span>
          <span className="ce-logo-text">Kod Muharrir</span>
        </div>

        <nav className="ce-lang-tabs" role="tablist" aria-label="Dasturlash tili">
          {LANGS.map(l => (
            <button
              key={l.id}
              role="tab"
              aria-selected={lang.id === l.id}
              className={`ce-lang-tab ${lang.id === l.id ? 'ce-lang-tab--active' : ''}`}
              style={lang.id === l.id ? { color: l.color, borderBottomColor: l.color } : undefined}
              onClick={() => switchLang(l)}
              title={l.label}
            >
              <span className="ce-tab-icon">{l.icon}</span>
              <span className="ce-tab-label">{l.label}</span>
            </button>
          ))}
        </nav>

        <div className="ce-actions">
          <button className="ce-btn-icon" onClick={copyCode} title="Kodni nusxalash (Ctrl+C)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
          </button>
          <button className="ce-btn-icon" onClick={resetCode} title="Boshlang'ich kodni tiklash">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/>
            </svg>
          </button>
          <button
            className={`ce-btn-run ${status === 'running' ? 'ce-btn-run--loading' : ''}`}
            onClick={handleRun}
            disabled={status === 'running'}
            title="Kodni ishga tushirish (Ctrl+Enter)"
          >
            {status === 'running'
              ? <><span className="ce-spin" />Ishlayapti…</>
              : <>▶&nbsp;Ishga tushirish</>}
          </button>
        </div>
      </header>

      {/* ── Main Split ──────────────────────────────────────────────────────── */}
      <div className="ce-main">

        {/* Editor */}
        <div className="ce-editor-pane">
          <Editor
            language={lang.monacoLang}
            defaultValue={lang.defaultCode}
            theme="vs-dark"
            onMount={handleMount}
            options={{
              fontSize: 14,
              fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderLineHighlight: 'line',
              tabSize: 2,
              wordWrap: 'off',
              automaticLayout: true,
              padding: { top: 14, bottom: 14 },
              quickSuggestions: true,
              bracketPairColorization: { enabled: true },
              formatOnPaste: true,
              scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            }}
            loading={
              <div className="ce-editor-loading">
                <span className="ce-spin ce-spin--lg" />
                <span>Muharrir yuklanmoqda…</span>
              </div>
            }
          />
        </div>

        {/* Output */}
        <div className="ce-out-pane">

          {/* Output panel header */}
          <div className="ce-out-header">
            <div className="ce-out-tabs">
              <button
                className={`ce-out-tab ${activeTab === 'output' ? 'ce-out-tab--active' : ''}`}
                onClick={() => setActiveTab('output')}
              >
                {isHTML ? '🖥 Ko\'rinish' : '📤 Chiqish'}
              </button>
              {needsStdin && (
                <button
                  className={`ce-out-tab ${activeTab === 'stdin' ? 'ce-out-tab--active' : ''}`}
                  onClick={() => setActiveTab('stdin')}
                  title="Dasturga kiritish ma'lumotlari (input())"
                >
                  📥 Kirish
                </button>
              )}
            </div>
            <div className="ce-out-meta">
              {execMs !== null && (
                <span className="ce-badge ce-badge--time">{execMs < 1000 ? `${execMs.toFixed(0)}ms` : `${(execMs/1000).toFixed(1)}s`}</span>
              )}
              {exitCode !== null && (
                <span className={`ce-badge ${exitCode === 0 ? 'ce-badge--ok' : 'ce-badge--err'}`}>
                  exit {exitCode}
                </span>
              )}
              <span className={`ce-dot ce-dot--${status}`} title={status} />
            </div>
          </div>

          {/* Output body */}
          <div className="ce-out-body">
            {activeTab === 'stdin' ? (
              <div className="ce-stdin-wrap">
                <p className="ce-stdin-hint">
                  Dastur uchun stdin kiritish (<code>input()</code> / <code>scanf</code> / <code>Scanner</code>):
                </p>
                <textarea
                  className="ce-stdin"
                  value={stdin}
                  onChange={e => setStdin(e.target.value)}
                  placeholder="Har bir qator — bitta kiritish bo'ladi…"
                  spellCheck={false}
                />
              </div>
            ) : isHTML ? (
              <iframe
                className="ce-html-frame"
                srcDoc={htmlPreview}
                sandbox="allow-scripts allow-modals allow-forms allow-popups"
                title="HTML ko'rinishi"
              />
            ) : (
              <div className="ce-console" aria-live="polite">
                {status === 'idle' && (
                  <p className="ce-console-hint">
                    ▶ Ishga tushirish tugmasini bosing yoki <kbd>Ctrl+Enter</kbd>
                  </p>
                )}
                {status === 'running' && (
                  <p className="ce-console-hint">
                    <span className="ce-spin ce-spin--sm" /> Ijro etilmoqda…
                  </p>
                )}
                {(status === 'success' || status === 'error') && output.length === 0 && (
                  <p className="ce-console-hint ce-console-hint--muted">Chiqish yo'q</p>
                )}
                {output.map((line, i) => (
                  <div key={i} className={`ce-line ce-line--${line.kind}`}>
                    <span className="ce-line-gutter">
                      {line.kind === 'stderr' || line.kind === 'error' ? '✕'
                       : line.kind === 'warn'   ? '⚠'
                       : line.kind === 'info'   ? 'i'
                       : line.kind === 'system' ? '·' : '>'}
                    </span>
                    <pre className="ce-line-text">{line.text}</pre>
                  </div>
                ))}
                <div ref={outputEndRef} />
              </div>
            )}
          </div>

          {/* Status bar */}
          <div className="ce-statusbar">
            <span className="ce-statusbar-lang" style={{ color: lang.color }}>
              {lang.icon} {lang.label}
              {runtimeVer && <span className="ce-statusbar-ver"> v{runtimeVer}</span>}
            </span>
            <span className="ce-statusbar-state">
              {status === 'idle'    && <span className="ce-s-idle">Tayyor</span>}
              {status === 'running' && <span className="ce-s-run">Ijro etilmoqda…</span>}
              {status === 'success' && <span className="ce-s-ok">✓ Muvaffaqiyatli</span>}
              {status === 'error'   && <span className="ce-s-err">✕ Xatolik</span>}
              {lang.mode === 'piston' && status !== 'running' && (
                <span className="ce-s-secure" title="Piston API — Docker sandbox"> 🔒 Xavfsiz</span>
              )}
              {lang.mode === 'js' && status !== 'running' && (
                <span className="ce-s-secure" title="Izolyatsiyalangan iframe sandbox"> 🔒 Sandbox</span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* ── Hint Bar ────────────────────────────────────────────────────────── */}
      <footer className="ce-hintbar">
        <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> ishga tushiradi</span>
        <span><kbd>Tab</kbd> — 2 bo'sh joy</span>
        <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> bekor qiladi</span>
        <span><kbd>Ctrl</kbd>+<kbd>/</kbd> izoh qo'shadi</span>
      </footer>
    </div>
  )
}

export default CodeEditor
