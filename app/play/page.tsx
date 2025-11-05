"use client";

import { useEffect, useState, useRef } from "react";
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

  const currentQuestionId = useRef<number | null>(null);

  const loadCurrentQuestion = async (teamId?: string) => {
    const { data: current } = await supabase
      .from("current_question")
      .select("question_id")
      .eq("id", 1)
      .maybeSingle();

    if (!current?.question_id) {
      setQuestion(null);
      setSent(false);
      return;
    }

    // ⚠️ Ne recharge rien si la question n’a pas changé
    if (currentQuestionId.current === current.question_id) return;

    currentQuestionId.current = current.question_id;

    const { data: q } = await supabase
      .from("questions")
      .select("*")
      .eq("id", current.question_id)
      .single();

    setQuestion(q);
    setArtist("");
    setTitle("");
    setSent(false);

    // Vérifie si l’équipe a déjà répondu à cette nouvelle question
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
      }
    }

    setLoading(false);
  };

  useEffect(() => {
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

    const interval = setInterval(() => {
      loadCurrentQuestion(team?.id);
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [team?.id]);

  const handleCreateTeam = async () => {
    if (!tmpName.trim()) {
      alert("Donne un nom d'équipe original ✨");
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

  const handleSubmit = async () => {
    if (!team || !question) return;
    if (!question.is_open) return;
    if (sent) return;

    setSent(true);

    const { error } = await supabase.from("answers").upsert({
      team_id: team.id,
      question_id: question.id,
      artist,
      title,
    });

    if (error) {
      setSent(false);
      alert("Oups, problème de connexion. Réessaie !");
    }
  };

  const handleResetTeam = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("bt_team");
    }
    setTeam(null);
    setAskTeam(true);
    setSent(false);
    setArtist("");
    setTitle("");
    currentQuestionId.current = null;
  };

  if (loading) {
    return <p style={{ padding: 20 }}>Chargement…</p>;
  }

  if (askTeam) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>Blind Test Disco 🪩</h1>
          <p style={styles.subtitle}>1 téléphone par table</p>
          <p style={styles.description}>
            👉 Mettre un <b>nom d'équipe original</b> et le{" "}
            <b>numéro de table</b> indiqué sur les consignes.
          </p>
          <input
            value={tmpName}
            onChange={(e) => setTmpName(e.target.value)}
            placeholder="Nom de l'équipe"
            style={styles.input}
          />
          <input
            value={tmpTable}
            onChange={(e) => setTmpTable(e.target.value)}
            placeholder="Numéro de table"
            style={styles.input}
          />
          <button onClick={handleCreateTeam} style={styles.primaryButton}>
            Rejoindre ✅
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div>
            <div style={styles.badge}>
              {team?.table_number ? `Table ${team.table_number}` : "Table"}
            </div>
            <h2 style={styles.titleSmall}>{team?.name}</h2>
          </div>
          <button onClick={handleResetTeam} style={styles.resetBtn}>
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
  header: {
    marginBottom: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 26, marginBottom: 6 },
  titleSmall: { fontSize: 20, margin: 0 },
  subtitle: { color: "#94a3b8", marginBottom: 8 },
  description: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: "1.4em",
    marginBottom: 16,
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
  question: { fontWeight: 600, marginBottom: 10 },
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
  muted: { color: "#94a3b8", margin: 0 },
  footer: { marginTop: 14, fontSize: 12, color: "rgba(226,232,240,0.4)" },
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
