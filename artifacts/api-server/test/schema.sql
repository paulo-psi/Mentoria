-- Private disposable database fixture. Keep columns and constraints used by
-- roster routes aligned with lib/db/src/schema; never load production data.
CREATE TABLE mentors (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text UNIQUE,
  expertise_area text,
  mentor_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mentors_type_valid CHECK (mentor_type IN ('interno', 'externo'))
);
CREATE TABLE teams (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  pitch_summary text,
  main_mentor_id integer NOT NULL REFERENCES mentors(id) ON DELETE RESTRICT,
  current_stage text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE students (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL,
  CONSTRAINT students_team_sort_order_unique UNIQUE (team_id, sort_order)
);
CREATE TABLE mentoring_sessions (
  id serial PRIMARY KEY,
  team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  mentor_id integer NOT NULL REFERENCES mentors(id) ON DELETE RESTRICT,
  session_type text NOT NULL CHECK (session_type IN ('principal', 'transversal', 'externo')),
  session_date date NOT NULL,
  team_nps integer NOT NULL CHECK (team_nps BETWEEN 0 AND 10),
  team_actionability integer NOT NULL CHECK (team_actionability BETWEEN 0 AND 10),
  mentor_commitment integer NOT NULL CHECK (mentor_commitment BETWEEN 0 AND 10),
  mentor_traction integer NOT NULL CHECK (mentor_traction BETWEEN 0 AND 10),
  team_feedback_strong_points text NOT NULL,
  team_feedback_improvements text NOT NULL,
  agreed_next_steps text NOT NULL,
  mentor_qualitative_assessment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE roster_audit (
  id serial PRIMARY KEY,
  team_id integer NOT NULL,
  student_id integer,
  action text NOT NULL,
  actor_email text NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);