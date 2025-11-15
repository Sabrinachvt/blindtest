"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

type Question = {
  id: number;
  label: string;
  expected_artist?: string | null;
  expected_title?: string | null;
  is_open?: boolean;
};

type Team = {
  id: string;
  name: string;
  table_number: number;
  bonus_points: number;
};

type Answer = {
  id: number;
  team_id: string;
  question_id: number;
  text_answer: string | null;
  answer_points: number | null;
  team?: Team;
};

export default function AdminMobilePage() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [changingQuestion, setChangingQuestion] = useState(false);

  // ------ CHARGEMENT GLOBAL ------
  const loadEverything = async () => {
    // Questions
    const { data: qList } = await supabase.from("questions").select("*");
    const sortedQuestions = (qList || []).sort((a, b) => a.id - b.id);
    setQuestions(sortedQuestions);

    // Question active
    const { data: current } = await supabase
      .from("current_question")
      .select("question_id")
      .eq("id", 1)
      .maybeSingle();

    if (current?.question_id) {
      const { data: q } = await supabase
        .from("questions")
        .select("*")
        .eq("id", current.question_id)
        .single();

      setQuestion(q);
    } else {
      setQuestion(null);
    }

    // Teams
    const { data: t } = await supabase
      .from("teams")
      .select("*")
      .order("table_number");

    setTeams(t || []);

    // Answers
    if (current?.question_id) {
      const { data: ans } = await supabase
        .from("answers")
        .select("*, team:team_id(*)")
        .eq("question_id", current.question_id);

      const sorted = (ans || []).sort(
        (a, b) =>
          (a.team?.table_number ?? 9999) -
          (b.team?.table_number ?? 9999)
      );

      setAnswers(sorted);
    } else {
      setAnswers([]);
    }
  };

  useEffect(() => {
    loadEverything();
    const interval = setInterval(loadEverything, 5000);
    return () => clearInterval(interval);
  }, []);

  // ------ CHANGER DE QUESTION ------
  const setCurrentQuestion = async (newId: number) => {
    setChangingQuestion(true);

    // Fermer toutes les questions
    await supabase.from("questions").update({ is_open: false }).neq("id", newId);

    // Ouvrir la nouvelle
    await supabase.from("questions").update({ is_open: true }).eq("id", newId);

    // Mettre à jour current_question
    await supabase
      .from("current_question")
      .update({ question_id: newId })
      .eq("id", 1);

    await loadEverything();
    setChangingQuestion(false);
  };

  const goToNext = () => {
    if (!question) return;
    const index = questions.findIndex((q) => q.id === question.id);
    if (index < questions.length - 1) {
      setCurrentQuestion(questions[index + 1].id);
    }
  };

  const goToPrev = () => {
    if (!question) return;
    const index = questions.findIndex((q) => q.id === question.id);
    if (index > 0) {
      setCurrentQuestion(questions[index - 1].id);
    }
  };

  // ------ POINTS RÉPONSE (0/1/2) ------
  const handleSetPoints = async (answerId: number, points: number) => {
    setSavingId(answerId);
    await supabase
      .from("answers")
      .update({ answer_points: points })
      .eq("id", answerId);

    await loadEverything();
    setSavingId(null);
  };

  // ------ POINTS D'AMBIANCE ------
  const addAmbiancePoint = async (teamId: string) => {
    await supabase.rpc("increment_bonus", { team_id_input: teamId });
    await loadEverything();
  };

  // ------ CRÉER LA FUNCTION SI PAS EXISTANTE ------
  // (à mettre UNE fois dans Supabase)
  // CREATE OR REPLACE FUNCTION increment_bonus(team_id_input uuid)
  // RETURNS void LANGUAGE plpgsql AS $$
  // BEGIN
  //   UPDATE teams SET bonus_points = bonus_points + 1 WHERE id = team_id_input;
  // END;
  // $$;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        padding: 12,
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 10 }}>Admin Mobile 🎛️</h1>

      {question && (
        <div
          style={{
            background: "#1e293b",
            padding: 12,
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button
              onClick={goToPrev}
              disabled={changingQuestion}
              style={btnNav}
            >
              ◀️
            </button>
            <button
              onClick={goToNext}
              disabled={changingQuestion}
              style={btnNav}
            >
              ▶️
            </button>
          </div>

          <div style={{ fontSize: 16, marginBottom: 4 }}>
            <b>Question :</b> {question.label}
          </div>

          {(question.expected_artist || question.expected_title) && (
            <div style={{ color: "#94a3b8", fontSize: 14 }}>
              ✔️ Réponse officielle :{" "}
              {question.expected_artist} – {question.expected_title}
            </div>
          )}
        </div>
      )}

      {/* LISTE DES RÉPONSES */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {answers.map((ans) => {
          const team = ans.team;

          const totalPoints =
            (ans.answer_points ?? 0) + (team?.bonus_points ?? 0);

          return (
            <div
              key={ans.id}
              style={{
                background: "#1e293b",
                padding: 12,
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                <b>Table {team?.table_number}</b> – {team?.name}
              </div>

              <div
                style={{
                  color: "#cbd5e1",
                  fontSize: 14,
                  marginBottom: 6,
                }}
              >
                <i>{ans.text_answer || "—"}</i>
              </div>

              {/* Boutons 0/1/2 */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {[0, 1, 2].map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSetPoints(ans.id, p)}
                    disabled={savingId === ans.id}
                    style={{
                      ...btnPoints,
                      background:
                        ans.answer_points === p ? "#f59e0b" : "#334155",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              {/* Ambiance */}
              <button
                onClick={() => addAmbiancePoint(team!.id)}
                style={btnAmbiance}
              >
                +1 ambiance 🎉
              </button>

              <div style={{ marginTop: 8, fontSize: 13, color: "#94a3b8" }}>
                Total : <b>{totalPoints} pts</b>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ----- STYLES -----
const btnNav = {
  flex: 1,
  background: "#334155",
  border: "none",
  padding: 10,
  fontSize: 18,
  borderRadius: 8,
  color: "white",
  cursor: "pointer",
};

const btnPoints = {
  flex: 1,
  padding: "10px 0",
  borderRadius: 6,
  border: "none",
  color: "white",
  fontSize: 18,
  cursor: "pointer",
};

const btnAmbiance = {
  width: "100%",
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  border: "none",
  color: "white",
  padding: 10,
  borderRadius: 8,
  fontSize: 16,
  cursor: "pointer",
};
