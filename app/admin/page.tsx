"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  question_number: number | null;
  label: string;
  is_open?: boolean | null;
};

export default function AdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Charger toutes les questions dans l'ORDRE du question_number
  const loadQuestions = async () => {
    setLoading(true);

    const { data } = await supabase
      .from("questions")
      .select("id, question_number, label, is_open")
      .not("question_number", "is", null)
      .order("question_number", { ascending: true });

    const list = (data as Question[]) || [];
    setQuestions(list);

    const active = list.find((q) => q.is_open === true) || null;
    setActiveId(active ? active.id : null);

    setLoading(false);
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  // Ouvre une question donnée (ferme les autres + met à jour current_question)
  const openQuestion = async (id: string) => {
    // Fermer toutes les questions
    await supabase.from("questions").update({ is_open: false });

    // Ouvrir celle qu'on veut
    await supabase.from("questions").update({ is_open: true }).eq("id", id);

    // Mettre à jour current_question
    await supabase
      .from("current_question")
      .update({ question_id: id })
      .eq("id", 1);

    setActiveId(id);
    await loadQuestions();
  };

  // Aller à la question suivante (selon question_number)
  const goNext = () => {
    if (!activeId) return;
    const index = questions.findIndex((q) => q.id === activeId);
    if (index >= 0 && index < questions.length - 1) {
      const nextQuestion = questions[index + 1];
      openQuestion(nextQuestion.id);
    }
  };

  // Aller à la question précédente
  const goPrev = () => {
    if (!activeId) return;
    const index = questions.findIndex((q) => q.id === activeId);
    if (index > 0) {
      const prevQuestion = questions[index - 1];
      openQuestion(prevQuestion.id);
    }
  };

  const activeQuestion = questions.find((q) => q.id === activeId) || null;

  return (
    <div
      style={{
        padding: 20,
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        background: "#020617",
        minHeight: "100vh",
        color: "#e5e7eb",
      }}
    >
      <h1 style={{ fontSize: 24, marginBottom: 10 }}>Admin – Blind Test 🎛️</h1>

      <div style={{ marginBottom: 12 }}>
        {activeQuestion ? (
          <p style={{ margin: 0 }}>
            Question actuelle :{" "}
            <strong>
              Q{activeQuestion.question_number} – {activeQuestion.label}
            </strong>
          </p>
        ) : (
          <p style={{ margin: 0 }}>Aucune question active pour le moment.</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={goPrev}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #4b5563",
            background: "#111827",
            color: "#e5e7eb",
            cursor: "pointer",
            flex: 1,
          }}
        >
          ◀️ Précédente
        </button>
        <button
          onClick={goNext}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #4b5563",
            background: "#111827",
            color: "#e5e7eb",
            cursor: "pointer",
            flex: 1,
          }}
        >
          Suivante ▶️
        </button>
      </div>

      {loading && <p>Chargement des questions…</p>}

      {!loading && (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {questions.map((q) => (
            <li key={q.id} style={{ marginBottom: 8 }}>
              <button
                onClick={() => openQuestion(q.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border:
                    q.id === activeId
                      ? "1px solid #f59e0b"
                      : "1px solid #4b5563",
                  background: q.id === activeId ? "#f59e0b33" : "#020617",
                  color: "#e5e7eb",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                <strong>Q{q.question_number}</strong> – {q.label}
                {q.id === activeId && " ✅"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
