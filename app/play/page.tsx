"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Team = {
  id: string;
  name: string;
  table_number?: number | null;
};

export default function PlayPage() {
  const [team, setTeam] = useState<Team | null>(null);
  const [question, setQuestion] = useState<any>(null);
  const [sent, setSent] = useState(false);
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [askTeam, setAskTeam] = useState(false);
  const [tmpName, setTmpName] = useState("");
  const [tmpTable, setTmpTable] = useState("");

  // charge / recharge la question active
  const loadCurrentQuestion = async (teamId?: string) => {
    const { data: current } = await supabase
      .from("current_question")
      .select("question_id")
      .eq("id", 1)
      .maybeSingle();

    if (current?.question_id) {
      const previousQuestionId = question?.id;

      const { data: q } = await supabase
        .from("questions")
        .select("*")
        .eq("id", current.question_id)
        .single();

      // si on passe à une nouvelle question -> on vide les champs
      if (!previousQuestionId || previousQuestionId !== q.id) {
        setArtist("");
        setTitle("");
        setSent(false);
      }

      setQuestion(q);

      // vérifier si cette équipe a déjà répondu
      if (teamId) {
        const { data: ans } = await supabase
          .from("answers")
          .select("*")
          .eq("team_id", teamId)
          .eq("question_id", current.question_id)
          .maybeSingle();

        if (ans) {
          setSent(true);
          setArtist(ans.artist || "");
          setTitle(ans.title || "");
        } else {
          setSent(false);
          setArtist("");
          setTitle("");
        }
      } else {
        setSent(false);
      }
    } else {
      setQuestion(null);
      setSent(false);
    }

    setLoading(false);
  };

  useEffect(() => {
    // 1) voir si on a déjà une équipe
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("bt_team") : null;

    if (saved) {
      const parsed = JSON.parse(saved);
      setTeam(parsed);
      loadCurrentQuestion(parsed.id);
    } else {
      setAskTeam(true);
      setLoading(false);
    }

    // 2) écouter le changement de question (admin)
    const channel = supabase
      .channel("question_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "current_question" },
        async () => {
          await loadCurrentQuestion(team?.id);
        }
      )
      .subscribe();

    // 3) polling de secours
    const interval = setInterval(() => {
      loadCurrentQuestion(team?.id);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [team?.id, question?.id]);

  // création d'équipe
  const handleCreateTeam = async () => {
    if (!tmpName.trim()) {
      alert("Donne un nom de table ✨");
      return;
    }
    if (!tmpTable.trim()) {
      alert("Le numéro de table est obligatoire 🤚");
      return;
    }
    const num = Number(tmpTable);
    if (Number.isNaN(num)) {
      alert("Le numéro de table doit être un nombre");
      return;
    }

    const { data, error } = await supabase
      .from("teams")
      .upsert({
        name: tmpName.trim(),
        table_number: num,
      })
      .select()
      .single();

    if (!error && data) {
      setTeam(data);
      if (typeof window !== "undefined") {
        localStorage.setItem("bt_team", JSON.stringify(data));
      }
      await loadCurrentQuestion(data.id);
      setAskTeam(false);
    }
  };

  // envoi de réponse
  const handleSubmit = async () => {
    if (!team || !question) return;
    if (!question.is_open) return;

    const { error } = await supabase.from("answers").upsert({
      team_id: team.id,
      question_id: question.id,
      artist,
      title,
    });

    if (!error) {
      setSent(true);
    }
  };

  // bouton "changer de table" (pour les tests / au cas où)
  const handleResetTeam = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("bt_team");
    }
    setTeam(null);
    setAskTeam(true);
    setSent(false);
    setArtist("");
    setTitle("");
  };

  if (loading) {
    return <p style={{ padding: 20 }}>Chargement…</p>;
  }

  // écran d'inscription
  if (askTeam) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Blind Test Disco 🪩</h1>
          <p style={styles.subtitle}>1 téléphone par table</p>
          <input
            value={tmpName}
            onChange={(e) => setTmpName(e.target.value)}
            placeholder="Nom de la table"
            style={styles.input}
          />
          <input
            value={tmpTable}
            onChange={(e) => setTmpTable(e.target.value)}
            placeholder="Numéro de table (obligatoire)"
            style={styles.input}
          />
          <button onClick={handleCreateTeam} style={styles.primaryButton}>
            Rejoindre ✅
          </button>
        </div>
      </div>
    );
  }

  // écran de jeu
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div>
            <div style={styles.badge}>
              {team?.table_number ? `Table ${team.table_number}` : "Table"}
            </div>
            <h2 style={styles.titleSmall}>{team?.name}</h2>
          </div>
          <button onClick={handleResetTeam} style={styles.resetBtn} title="Changer de table">
            🔁
          </button>
        </div>

        {!question ? (
          <p style={styles.muted}>En attente de la prochaine question…</p>
        ) : !question.is_open ? (
          <div style={styles.alert}>
            Question fermée ✅ <br /> Attends la prochaine musique…
          </div>
        ) : sent ? (
          <div style={styles.success}>
            Réponse envoyée ✅
            <p style={styles.muted}>Attends la prochaine question</p>
          </div>
        ) : (
          <>
            <p style={styles.question}>{question.label}</p>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Artiste"
              style={styles.input}
            />
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre"
              style={styles.input}
            />
            <button onClick={handleSubmit} style={styles.primaryButton}>
              Envoyer 🎯
            </button>
          </>
        )}
      </div>
      <p style={styles.footer}>Made for fondue disco ✨</p>
    </div>
  );
}

const styles: Record<string, any> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background:
      "radial-gradient(circle at top, #1f2937 0%, #0f172a 50%, #020617 100%)",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 460,
    background: "rgba(2,6,23,0.5)",
    border: "1px solid rgba(148,163,184,0.2)",
    borderRadius: 18,
    padding: 18,
    backdropFilter: "blur(8px)",
  },
  title: {
    fontSize: 26,
    marginBottom: 6,
  },
  titleSmall: {
    fontSize: 20,
    margin: 0,
  },
  subtitle: {
    color: "#94a3b8",
    marginBottom: 12,
  },
  input: {
    width: "100%",
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(148,163,184,0.3)",
    borderRadius: 10,
    padding: "10px 12px",
    color: "#e2e8f0",
    marginBottom: 10,
    fontSize: 15,
  },
  primaryButton: {
    width: "100%",
    background: "linear-gradient(135deg, #f97316, #a855f7)",
    border: "none",
    borderRadius: 10,
    padding: "10px 12px",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 15,
  },
  badge: {
    display: "inline-block",
    background: "rgba(248, 113, 113, 0.2)",
    border: "1px solid rgba(248, 113, 113, 0.4)",
    borderRadius: 9999,
    padding: "4px 10px",
    fontSize: 12,
    color: "#e2e8f0",
    marginBottom: 4,
  },
  question: {
    fontWeight: 600,
    marginBottom: 10,
  },
  alert: {
    background: "rgba(251, 191, 36, 0.12)",
    border: "1px solid rgba(251, 191, 36, 0.3)",
    borderRadius: 10,
    padding: 10,
  },
  success: {
    background: "rgba(34, 197, 94, 0.08)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    borderRadius: 10,
    padding: 10,
  },
  muted: {
    color: "#94a3b8",
    margin: 0,
  },
  footer: {
    marginTop: 14,
    fontSize: 12,
    color: "rgba(226,232,240,0.4)",
  },
  resetBtn: {
    background: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(148,163,184,0.3)",
    borderRadius: 9999,
    width: 36,
    height: 36,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
};
