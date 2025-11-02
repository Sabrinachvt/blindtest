"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Question = {
  id: string;
  label: string;
  is_open: boolean;
  expected_artist?: string | null;
  expected_title?: string | null;
};

type Team = {
  id: string;
  name: string;
  table_number?: number | null;
  bonus_points: number;
};

export default function AdminPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null); // diffusée
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null); // celle qu'on corrige
  const [answers, setAnswers] = useState<any[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [scores, setScores] = useState<any[]>([]);

  // chargement initial
  useEffect(() => {
    const load = async () => {
      // 1. questions
      const { data: qs } = await supabase
        .from("questions")
        .select("*")
        .order("order_index", { ascending: true });
      setQuestions((qs || []) as Question[]);

      // 2. question diffusée
      const { data: cq } = await supabase
        .from("current_question")
        .select("question_id")
        .eq("id", 1)
        .maybeSingle();
      const liveId = cq?.question_id || null;
      setCurrentQuestionId(liveId);

      // 3. on choisit une question à corriger (par défaut, la diffusée)
      setSelectedQuestionId(liveId);

      // 4. équipes
      await loadTeams();

      // 5. réponses de la question sélectionnée
      if (liveId) {
        await loadAnswers(liveId);
      }

      // 6. classement
      await computeScores();
    };
    load();

    // écouter les nouvelles réponses
    const channel = supabase
      .channel("answers_realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "answers" },
        async (payload) => {
          // si la réponse concerne la question qu'on est en train de regarder
          if (payload.new.question_id === selectedQuestionId) {
            await loadAnswers(selectedQuestionId);
            await computeScores();
          }
        }
      )
      .subscribe();

    // écouter changement de question diffusée
    const cqChannel = supabase
      .channel("current_question_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "current_question" },
        async (payload) => {
          const qid = (payload.new as any).question_id;
          setCurrentQuestionId(qid);
          // on ne change pas selectedQuestionId → l'admin peut rester sur Q1
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(cqChannel);
    };
  }, [selectedQuestionId]);

  const loadTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("*")
      .order("table_number", { ascending: true })
      .order("created_at", { ascending: true });
    setTeams(
      (data || []).map((t: any) => ({
        ...t,
        bonus_points: t.bonus_points || 0,
      }))
    );
  };

  const loadAnswers = async (questionId: string | null) => {
    if (!questionId) {
      setAnswers([]);
      return;
    }
    const { data } = await supabase
      .from("answers")
      .select("*, team:teams(name, table_number)")
      .eq("question_id", questionId);
    setAnswers(data || []);
  };

  const computeScores = async () => {
    const { data: answersData } = await supabase
      .from("answers")
      .select("*, team:teams(name)");
    const { data: teamsData } = await supabase.from("teams").select("*");

    const byTeam: Record<string, { name: string; total: number }> = {};

    // points issus des réponses
    (answersData || []).forEach((a: any) => {
      const name = a.team?.name || "???";
      const pts =
        (a.artist_points || 0) +
        (a.title_points || 0) +
        (a.ambiance_points || 0);
      if (!byTeam[name]) {
        byTeam[name] = { name, total: 0 };
      }
      byTeam[name].total += pts;
    });

    // bonus d'équipe
    (teamsData || []).forEach((t: any) => {
      const name = t.name;
      const bonus = t.bonus_points || 0;
      if (!byTeam[name]) {
        byTeam[name] = { name, total: bonus };
      } else {
        byTeam[name].total += bonus;
      }
    });

    setScores(Object.values(byTeam).sort((a, b) => b.total - a.total));
  };

  // bouton : diffuser une question
  const broadcastQuestion = async (qid: string) => {
    await supabase.from("current_question").upsert({ id: 1, question_id: qid });
    setCurrentQuestionId(qid);
    // on peut décider de ne pas changer la question sélectionnée pour laisser l'admin corriger
  };

  // bouton : ouvrir / fermer une question
  const setQuestionOpenState = async (qid: string, isOpen: boolean) => {
    await supabase.from("questions").update({ is_open: isOpen }).eq("id", qid);
    // mettre à jour local
    setQuestions((prev) =>
      prev.map((q) => (q.id === qid ? { ...q, is_open: isOpen } : q))
    );
  };

  // quand l'admin clique dans la liste pour corriger
  const selectQuestion = async (qid: string) => {
    setSelectedQuestionId(qid);
    await loadAnswers(qid);
  };

  // +1 / -1 sur une réponse
  const updateAnswerPoint = async (
    answerId: string,
    field: "artist_points" | "title_points" | "ambiance_points",
    delta: number
  ) => {
    const current = answers.find((a) => a.id === answerId);
    if (!current) return;
    const currentVal = current[field] || 0;
    const newVal = Math.max(0, currentVal + delta);
    await supabase.from("answers").update({ [field]: newVal }).eq("id", answerId);
    await loadAnswers(selectedQuestionId);
    await computeScores();
  };

  // bonus d'équipe
  const updateTeamBonus = async (teamId: string, delta: number) => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    const newVal = Math.max(0, (team.bonus_points || 0) + delta);
    await supabase.from("teams").update({ bonus_points: newVal }).eq("id", teamId);
    await loadTeams();
    await computeScores();
  };

  const giveBonusToAll = async (amount: number) => {
    for (const t of teams) {
      const newVal = Math.max(0, (t.bonus_points || 0) + amount);
      await supabase.from("teams").update({ bonus_points: newVal }).eq("id", t.id);
    }
    await loadTeams();
    await computeScores();
  };

  // info de la question sélectionnée
  const selectedQuestion = questions.find((q) => q.id === selectedQuestionId) || null;

  return (
    <div style={{ display: "flex", gap: 20, padding: 20, fontFamily: "sans-serif" }}>
      {/* Colonne questions */}
      <div style={{ minWidth: 250 }}>
        <h2>Admin 🎤</h2>
        <h3>Questions</h3>
        <ul style={{ listStyle: "none", padding: 0, maxHeight: "75vh", overflow: "auto" }}>
          {questions.map((q) => (
            <li key={q.id} style={{ marginBottom: 8, borderBottom: "1px solid #eee", paddingBottom: 6 }}>
              <div
                style={{
                  fontWeight: q.id === selectedQuestionId ? "bold" : "normal",
                  cursor: "pointer",
                }}
                onClick={() => selectQuestion(q.id)}
              >
                {q.label}
                {q.id === currentQuestionId ? " 🔴 (diffusée)" : ""}
                {!q.is_open ? " (fermée)" : ""}
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                <button onClick={() => broadcastQuestion(q.id)}>👉 Diffuser</button>
                <button onClick={() => setQuestionOpenState(q.id, true)}>🟢 Ouvrir</button>
                <button onClick={() => setQuestionOpenState(q.id, false)}>🔴 Fermer</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Colonne réponses de la question sélectionnée */}
      <div style={{ flex: 1, minWidth: 380 }}>
        <h3>
          Réponses —{" "}
          {selectedQuestion ? selectedQuestion.label : "aucune question sélectionnée"}
        </h3>
        {selectedQuestion ? (
          <div
            style={{
              background: "#f8f8f8",
              border: "1px solid #eee",
              padding: 8,
              borderRadius: 4,
              marginBottom: 10,
            }}
          >
            <div>
              <strong>Ouverte :</strong>{" "}
              {selectedQuestion.is_open ? "Oui" : "Non (fermée aux joueurs)"}
            </div>
            <div>
              <strong>Artiste attendu :</strong>{" "}
              {selectedQuestion.expected_artist || "—"}
            </div>
            <div>
              <strong>Titre attendu :</strong>{" "}
              {selectedQuestion.expected_title || "—"}
            </div>
          </div>
        ) : null}

        {answers.length === 0 ? (
          <p>Aucune réponse pour l'instant.</p>
        ) : (
          answers.map((a) => (
            <div key={a.id} style={{ border: "1px solid #ddd", padding: 8, marginBottom: 6 }}>
              <strong>
                {a.team?.name}{" "}
                {a.team?.table_number ? `(Table ${a.team.table_number})` : ""}
              </strong>
              <div>Artiste (joueur) : {a.artist || "-"}</div>
              <div>Titre (joueur) : {a.title || "-"}</div>
              <div>
                Artiste pts : {a.artist_points}{" "}
                <button onClick={() => updateAnswerPoint(a.id, "artist_points", +1)}>
                  +1
                </button>
                <button onClick={() => updateAnswerPoint(a.id, "artist_points", -1)}>
                  -1
                </button>
              </div>
              <div>
                Titre pts : {a.title_points}{" "}
                <button onClick={() => updateAnswerPoint(a.id, "title_points", +1)}>
                  +1
                </button>
                <button onClick={() => updateAnswerPoint(a.id, "title_points", -1)}>
                  -1
                </button>
              </div>
              <div>
                Ambiance (réponse) : {a.ambiance_points}{" "}
                <button onClick={() => updateAnswerPoint(a.id, "ambiance_points", +1)}>
                  +1
                </button>
                <button onClick={() => updateAnswerPoint(a.id, "ambiance_points", -1)}>
                  -1
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Colonne bonus + classement */}
      <div style={{ minWidth: 260 }}>
        <h3>Bonus ambiance 🔥</h3>
        <button onClick={() => giveBonusToAll(5)} style={{ marginBottom: 10 }}>
          +5 à TOUT LE MONDE
        </button>
        <div style={{ maxHeight: 230, overflow: "auto", border: "1px solid #eee", padding: 6 }}>
          {teams.map((t) => (
            <div key={t.id} style={{ marginBottom: 6 }}>
              <strong>
                {t.name} {t.table_number ? `(Table ${t.table_number})` : ""}
              </strong>{" "}
              — bonus : {t.bonus_points || 0}
              <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                <button onClick={() => updateTeamBonus(t.id, +1)}>+1</button>
                <button onClick={() => updateTeamBonus(t.id, +5)}>+5</button>
                <button onClick={() => updateTeamBonus(t.id, +10)}>+10</button>
                <button onClick={() => updateTeamBonus(t.id, -1)}>-1</button>
                <button onClick={() => updateTeamBonus(t.id, -5)}>-5</button>
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 16 }}>Classement 🏆</h3>
        {scores.map((s, i) => (
          <div key={s.name}>
            {i + 1}. {s.name} — {s.total} pts
          </div>
        ))}
      </div>
    </div>
  );
}
