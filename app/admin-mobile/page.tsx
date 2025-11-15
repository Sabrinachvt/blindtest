"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

type Question = {
  id: number;
  label: string;
  expected_artist?: string | null;
  expected_title?: string | null;
};

type Team = {
  id: string;
  name: string;
  table_number?: number | null;
};

type Answer = {
  id: number;
  team_id: string;
  text_answer?: string | null;
  answer_points?: number | null;
};

type AnswerWithTeam = Answer & { team?: Team };

export default function AdminMobilePage() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [answers, setAnswers] = useState<AnswerWithTeam[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  const totalTeams = useMemo(() => teams.length, [teams.length]);
  const answeredCount = useMemo(
    () => answers.filter((a) => a.text_answer && a.text_answer.trim() !== "").length,
    [answers]
  );

  const loadData = async () => {
    setLoading(true);

    // 1) question actuelle
    const { data: current } = await supabase
      .from("current_question")
      .select("question_id")
      .eq("id", 1)
      .maybeSingle();

    if (!current?.question_id) {
      setQuestion(null);
      setAnswers([]);
      setLoading(false);
      return;
    }

    const { data: q } = await supabase
      .from("questions")
      .select("id, label, expected_artist, expected_title")
      .eq("id", current.question_id)
      .single();

    setQuestion(q as Question);

    // 2) toutes les équipes
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, table_number")
      .order("table_number", { ascending: true });

    setTeams((teamsData as Team[]) || []);

    // 3) réponses à cette question
    const { data: answersData } = await supabase
      .from("answers")
      .select("id, team_id, text_answer, answer_points")
      .eq("question_id", current.question_id);

    const teamsMap = new Map<string, Team>();
    (teamsData || []).forEach((t: any) => teamsMap.set(t.id, t));

    const withTeams: AnswerWithTeam[] = (answersData as Answer[] || []).map((a) => ({
      ...a,
      team: teamsMap.get(a.team_id),
    }));

    // On trie par numéro de table, puis par nom
    withTeams.sort((a, b) => {
      const ta = a.team?.table_number ?? 9999;
      const tb = b.team?.table_number ?? 9999;
      if (ta !== tb) return ta - tb;
      return (a.team?.name || "").localeCompare(b.team?.name || "");
    });

    setAnswers(withTeams);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 5000); // refresh toutes les 5 secondes

    return () => clearInterval(interval);
  }, []);

  const handleSetPoints = async (answerId: number, points: number) => {
    setSavingId(answerId);
    const { error } = await supabase
      .from("answers")
      .update({ answer_points: points })
      .eq("id", answerId);

    if (!error) {
      setAnswers((prev) =>
        prev.map((a) =>
          a.id === answerId ? { ...a, answer_points: points } : a
        )
      );
    }

    setSavingId(null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, #020617 0%, #020617 40%, #000 100%)",
        color: "#e5e7eb",
        padding: 12,
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0, marginBottom: 4 }}>
          Admin Mobile 🎛️
        </h1>
        {question ? (
          <>
            <p style={{ margin: 0, fontSize: 15 }}>
              <strong>Question :</strong> {question.label}
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
          </>
        ) : (
          <p style={{ margin: 0 }}>Aucune question en cours.</p>
        )}

        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 8,
            fontSize: 13,
            color: "#9ca3af",
          }}
        >
          <span>
            Réponses reçues :{" "}
            <strong>
              {answeredCount}/{totalTeams || "?"}
            </strong>
          </span>
          <button
            onClick={loadData}
            style={{
              marginLeft: "auto",
              fontSize: 12,
              padding: "4px 8px",
              borderRadius: 9999,
              border: "1px solid rgba(156,163,175,0.5)",
              background: "rgba(15,23,42,0.6)",
              color: "#e5e7eb",
              cursor: "pointer",
            }}
          >
            🔄 Rafraîchir
          </button>
        </div>
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
          const selected = ans.answer_points ?? 0;

          return (
            <div
              key={ans.id}
              style={{
                background: "rgba(15,23,42,0.8)",
                borderRadius: 14,
                padding: 10,
                border: "1px solid rgba(55,65,81,0.8)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "#9ca3af",
                      marginBottom: 2,
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
                  {ans.text_answer && ans.text_answer.trim() !== ""
                    ? ans.text_answer
                    : <span style={{ color: "#6b7280" }}>— (vide)</span>}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <span style={{ fontSize: 13 }}>Points :</span>
                {[0, 1, 2].map((value) => {
                  const isActive = selected === value;
                  const isSaving = savingId === ans.id;

                  return (
                    <button
                      key={value}
                      disabled={isSaving}
                      onClick={() => handleSetPoints(ans.id, value)}
                      style={{
                        flex: 1,
                        padding: "6px 0",
                        borderRadius: 9999,
                        border: isActive
                          ? "1px solid rgba(251,191,36,0.9)"
                          : "1px solid rgba(75,85,99,0.9)",
                        background: isActive
                          ? "linear-gradient(135deg,#f97316,#eab308)"
                          : "rgba(15,23,42,0.9)",
                        color: isActive ? "#111827" : "#e5e7eb",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
