"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  question_number?: number | null;
  label: string;
  expected_artist?: string | null;
  expected_title?: string | null;
  is_open?: boolean | null;
};

type Team = {
  id: string;
  name: string;
  table_number?: number | null;
  bonus_points?: number | null;
};

type Answer = {
  id: number;
  team_id: string;
  question_id: string;
  text_answer?: string | null;
  answer_points?: number | null;
  team?: Team;
};

export default function AdminMobilePage() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [changingQuestion, setChangingQuestion] = useState(false);
  const [loading, setLoading] = useState(true);

  // nombre de réponses & d'équipes pour l'indicateur
  const totalTeams = useMemo(() => teams.length, [teams]);
  const answeredCount = useMemo(
    () =>
      answers.filter(
        (a) => a.text_answer && a.text_answer.trim() !== ""
      ).length,
    [answers]
  );

  // -------- CHARGEMENT GLOBAL ----------
  const loadEverything = async () => {
    setLoading(true);

    // 1) Charger toutes les questions avec leur question_number
    const { data: qList } = await supabase
      .from("questions")
      .select("id, question_number, label, expected_artist, expected_title, is_open");

    const sortedQuestions: Question[] = (qList as Question[] | null) || [];
    sortedQuestions.sort(
      (a, b) =>
        (a.question_number ?? 9999) - (b.question_number ?? 9999)
    );
    setQuestions(sortedQuestions);

    // 2) Récupérer la question active via current_question
    const { data: current } = await supabase
      .from("current_question")
      .select("question_id")
      .eq("id", 1)
      .maybeSingle();

    let activeQuestion: Question | null = null;
    if (current?.question_id) {
      activeQuestion =
        sortedQuestions.find((q) => q.id === current.question_id) || null;
    }
    setQuestion(activeQuestion);

    // 3) Toutes les équipes (avec bonus_points)
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, table_number, bonus_points")
      .order("table_number", { ascending: true });

    const teamsList: Team[] = (teamsData as Team[] | null) || [];
    setTeams(teamsList);

    // 4) Les réponses de la question active
    if (activeQuestion) {
      const { data: ansData } = await supabase
        .from("answers")
        .select("id, team_id, question_id, text_answer, answer_points")
        .eq("question_id", activeQuestion.id);

      const answersList: Answer[] = (ansData as Answer[] | null) || [];

      // On rattache les équipes
      const teamMap = new Map<string, Team>();
      teamsList.forEach((t) => teamMap.set(t.id, t));

      const withTeams: Answer[] = answersList.map((a) => ({
        ...a,
        team: teamMap.get(a.team_id),
      }));

      // Tri par numéro de table puis nom
      withTeams.sort((a, b) => {
        const ta = a.team?.table_number ?? 9999;
        const tb = b.team?.table_number ?? 9999;
        if (ta !== tb) return ta - tb;
        return (a.team?.name || "").localeCompare(b.team?.name || "");
      });

      setAnswers(withTeams);
    } else {
      setAnswers([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadEverything();
    const interval = setInterval(loadEverything, 5000); // refresh auto
    return () => clearInterval(interval);
  }, []);

  // -------- CHANGER DE QUESTION PAR NUMÉRO ----------
  const setCurrentQuestionByNumber = async (newNumber: number) => {
    setChangingQuestion(true);

    // Fermer toutes les questions
    await supabase.from("questions").update({ is_open: false });

    // Ouvrir celle avec ce question_number
    const { data: qRow } = await supabase
      .from("questions")
      .select("id")
      .eq("question_number", newNumber)
      .maybeSingle();

    if (qRow?.id) {
      await supabase
        .from("questions")
        .update({ is_open: true })
        .eq("id", qRow.id);

      // Mettre à jour current_question
      await supabase
        .from("current_question")
        .update({ question_id: qRow.id })
        .eq("id", 1);
    }

    await loadEverything();
    setChangingQuestion(false);
  };

  const goToNext = () => {
    if (!question || !question.question_number) return;
    const currentNum = question.question_number;
    const nums = questions
      .map((q) => q.question_number)
      .filter((n): n is number => n !== null && n !== undefined)
      .sort((a, b) => a - b);

    const idx = nums.indexOf(currentNum);
    if (idx >= 0 && idx < nums.length - 1) {
      const nextNum = nums[idx + 1];
      setCurrentQuestionByNumber(nextNum);
    }
  };

  const goToPrev = () => {
    if (!question || !question.question_number) return;
    const currentNum = question.question_number;
    const nums = questions
      .map((q) => q.question_number)
      .filter((n): n is number => n !== null && n !== undefined)
      .sort((a, b) => a - b);

    const idx = nums.indexOf(currentNum);
    if (idx > 0) {
      const prevNum = nums[idx - 1];
      setCurrentQuestionByNumber(prevNum);
    }
  };

  // -------- POINTS RÉPONSE (0/1/2) ----------
  const handleSetPoints = async (answerId: number, points: number) => {
    setSavingId(answerId);
    await supabase
      .from("answers")
      .update({ answer_points: points })
      .eq("id", answerId);
    await loadEverything();
    setSavingId(null);
  };

  // -------- POINTS D'AMBIANCE (+1) ----------
  const addAmbiancePoint = async (team: Team | undefined) => {
    if (!team) return;
    const current = team.bonus_points ?? 0;
    await supabase
      .from("teams")
      .update({ bonus_points: current + 1 })
      .eq("id", team.id);
    await loadEverything();
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#020617",
        color: "#e5e7eb",
        padding: 12,
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header style={{ marginBottom: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0, marginBottom: 6 }}>
          Admin Mobile 🎛️
        </h1>

        {question ? (
          <>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 8,
              }}
            >
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

            <p style={{ margin: 0, fontSize: 15 }}>
              <strong>
                Q{question.question_number ?? "?"} :
              </strong>{" "}
              {question.label}
            </p>
            {(question.expected_artist || question.expected_title) && (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: 13,
                  color: "#9ca3af",
                }}
              >
                ✅ Réponse officielle :{" "}
                {question.expected_artist && (
                  <span>{question.expected_artist} </span>
                )}
                {question.expected_title && (
                  <span>– {question.expected_title}</span>
                )}
              </p>
            )}

            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                fontSize: 13,
                color: "#9ca3af",
                alignItems: "center",
              }}
            >
              <span>
                Réponses :{" "}
                <strong>
                  {answeredCount}/{totalTeams || "?"}
                </strong>
              </span>
              <button
                onClick={loadEverything}
                style={{
                  marginLeft: "auto",
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 9999,
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                  cursor: "pointer",
                }}
              >
                🔄 Rafraîchir
              </button>
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>Aucune question active.</p>
        )}
      </header>

      {loading && <p>Chargement…</p>}

      {!loading && question && answers.length === 0 && (
        <p style={{ fontSize: 14, color: "#9ca3af" }}>
          Pas encore de réponses pour cette question.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {answers.map((ans) => {
          const team = ans.team;
          const basePoints = ans.answer_points ?? 0;
          const ambiance = team?.bonus_points ?? 0;
          const totalPoints = basePoints + ambiance;

          return (
            <div
              key={ans.id}
              style={{
                background: "rgba(15,23,42,0.9)",
                borderRadius: 14,
                padding: 10,
                border: "1px solid rgba(55,65,81,0.9)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#9ca3af",
                    }}
                  >
                    {team?.table_number
                      ? `Table ${team.table_number}`
                      : "Table ?"}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {team?.name || "Équipe inconnue"}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <div style={{ color: "#9ca3af" }}>Réponse joueur :</div>
                <div style={{ marginTop: 2 }}>
                  {ans.text_answer && ans.text_answer.trim() !== "" ? (
                    ans.text_answer
                  ) : (
                    <span style={{ color: "#6b7280" }}>— (vide)</span>
                  )}
                </div>
              </div>

              {/* Boutons 0 / 1 / 2 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 6,
                  marginBottom: 6,
                }}
              >
                <span style={{ fontSize: 13 }}>Points :</span>
                {[0, 1, 2].map((value) => {
                  const isActive = ans.answer_points === value;
                  const isSaving = savingId === ans.id;

                  return (
                    <button
                      key={value}
                      disabled={isSaving}
                      onClick={() => handleSetPoints(ans.id, value)}
                      style={{
                        ...btnPoints,
                        background: isActive ? "#f59e0b" : "#334155",
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>

              {/* +1 ambiance */}
              <button
                onClick={() => addAmbiancePoint(team)}
                style={btnAmbiance}
              >
                +1 ambiance 🎉
              </button>

              <div
                style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: "#9ca3af",
                }}
              >
                Total : <b>{totalPoints} pts</b>{" "}
                <span style={{ fontSize: 12 }}>
                  (réponse {basePoints} + ambiance {ambiance})
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------- STYLES -------
const btnNav: React.CSSProperties = {
  flex: 1,
  background: "#334155",
  border: "none",
  padding: 8,
  fontSize: 16,
  borderRadius: 8,
  color: "#e5e7eb",
  cursor: "pointer",
};

const btnPoints: React.CSSProperties = {
  flex: 1,
  padding: "6px 0",
  borderRadius: 9999,
  border: "none",
  color: "white",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

const btnAmbiance: React.CSSProperties = {
  width: "100%",
  background: "linear-gradient(135deg,#22c55e,#16a34a)",
  border: "none",
  color: "white",
  padding: 8,
  borderRadius: 9999,
  fontSize: 14,
  cursor: "pointer",

