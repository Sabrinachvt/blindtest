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

  // 👉 fonction qu'on pourra réutiliser (temps réel + polling)
  const loadCurrentQuestion = async (teamId?: string) => {
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

      // est-ce que cette équipe a déjà répondu à CETTE question ?
      if (teamId) {
        const { data: ans } = await supabase
          .from("answers")
          .select("*")
          .eq("team_id", teamId)
          .eq("question_id", current.question_id)
          .maybeSingle();
        setSent(!!ans);
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
    // 1) on regarde si on a déjà une équipe
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

    // 2) abonnement temps réel (si activé sur Supabase)
    const channel = supabase
      .channel("question_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "current_question" },
        async (payload) => {
          const qid = (payload.new as any).question_id;
          if (!qid) {
            setQuestion(null);
            setSent(false);
            return;
          }
          // on recharge la question
          await loadCurrentQuestion(team?.id);
        }
      )
      .subscribe();

    // 3) POLLING de secours toutes les 3 secondes
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
      alert("Donnez un nom de table 😎");
      return;
    }
    if (!tmpTable.trim()) {
      alert("Le numéro de table est obligatoire 🤚");
      return;
    }
    const tableNum = Number(tmpTable);
    if (Number.isNaN(tableNum)) {
      alert("Le numéro de table doit être un nombre");
      return;
    }

    const { data, error } = await supabase
      .from("teams")
      .upsert({
        name: tmpName.trim(),
        table_number: tableNum,
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

  if (loading) {
    return <p style={{ padding: 20 }}>Chargement…</p>;
  }

  // écran d'inscription
  if (askTeam) {
    return (
      <div style={{ maxWidth: 480, margin: "20px auto", fontFamily: "sans-serif" }}>
        <h2>Blind Test 🎵</h2>
        <p>Bienvenue !</p>
        <input
          value={tmpName}
          onChange={(e) => setTmpName(e.target.value)}
          placeholder="Nom de table"
          style={{ width: "100%", marginBottom: 8, padding: 6 }}
        />
        <input
          value={tmpTable}
          onChange={(e) => setTmpTable(e.target.value)}
          placeholder="Numéro de table (obligatoire)"
          style={{ width: "100%", marginBottom: 8, padding: 6 }}
        />
        <button
          onClick={handleCreateTeam}
          style={{ width: "100%", padding: 10, cursor: "pointer" }}
        >
          Valider ✅
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "20px auto", fontFamily: "sans-serif" }}>
      <h2>Blind Test 🎵</h2>
      <p>
        <strong>Équipe :</strong> {team?.name}{" "}
        {team?.table_number ? `(Table ${team.table_number})` : null}
      </p>

      {!question ? (
        <p>En attente de la prochaine question…</p>
      ) : !question.is_open ? (
        <p
          style={{
            background: "#fff3cd",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #ffeeba",
          }}
        >
          Question fermée ✅
          <br />
          Attends la prochaine…
        </p>
      ) : sent ? (
        <p>✅ Réponse envoyée. Attends la prochaine.</p>
      ) : (
        <>
          <p>
            <strong>{question.label}</strong>
          </p>
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder="Artiste"
            style={{ width: "100%", marginBottom: 8, padding: 6 }}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titre"
            style={{ width: "100%", marginBottom: 8, padding: 6 }}
          />
          <button
            onClick={handleSubmit}
            style={{ width: "100%", padding: 10, cursor: "pointer" }}
          >
            Envoyer ✅
          </button>
        </>
      )}
    </div>
  );
}
