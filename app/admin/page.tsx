"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  question_number: number | null;
  label: string;
  expected_artist?: string | null;
  expected_title?: string | null;
  is_open?: boolean | null;
};

export default function AdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Charger toutes les questions dans l’ORDRE
  const loadQuestions = async () => {
    const { data } = await supabase
      .from("questions")
      .select("id, question_number, label, is_open")
      .not("question_number", "is", null)
      .order("question_number", { ascending: true });

    setQuestions((data as Question[]) || []);

    const active = data?.find((q: any) => q.is_open === true);
    setActiveId(active?.id || null);
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  // Ouvrir une question
  const openQuestion = async (id: string) => {
    await supabase.from("questions").update({ is_open: false });
    await supabase.from("questions").update({ is_open: true }).eq("id", id);
    await supabase.from("current_question").update({ question_id: id }).eq("id", 1);

    setActiveId(id);
    loadQuestions();
  };

  // Bouton “suivant”
  const goNext = () => {
    if (!activeId) return;
    const index = questions.findIndex((q) => q.id === activeId);
    if (index < questions.length - 1) {
      openQuestion(questions[index + 1].id);
    }
  };

  // Bouton “précédent”
  const goPrev = () => {
    if (!activeId) return;
    const index = questions.findIndex((q) => q.id === activeId);
    if (index > 0) {
      openQuestion(questions[index - 1].id);
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>ADMIN – Questions</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <button onClick={goPrev}>◀️</button>
        <button onClick={goNext}>▶️</button>
      </div>

      <ul>
        {questions.map((q) => (
          <li key={q.id} style={{ margin: "10px 0" }}>
            <button
              onClick={() => openQuestion(q.id)}
              style={{
                padding: "8px 12px",
                background: q.id === activeId ? "orange" : "lightgray",
              }}
            >
              Q{q.question_number} — {q.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
