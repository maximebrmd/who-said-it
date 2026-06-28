export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      chats: {
        Row: {
          id: string
          name: string
          slug: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          chat_id: string
          id: string
          participant_id: string
          rand_key: number
          sent_at: string
          seq: number
        }
        Insert: {
          body: string
          chat_id: string
          id?: string
          participant_id: string
          rand_key?: number
          sent_at: string
          seq: number
        }
        Update: {
          body?: string
          chat_id?: string
          id?: string
          participant_id?: string
          rand_key?: number
          sent_at?: string
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      participants: {
        Row: {
          chat_id: string
          display_name: string
          id: string
        }
        Insert: {
          chat_id: string
          display_name: string
          id?: string
        }
        Update: {
          chat_id?: string
          display_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participants_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
        ]
      }
      room_answers: {
        Row: {
          answer: string
          answered_at: string
          id: string
          is_correct: boolean
          player_id: string
          room_id: string
          round: number
        }
        Insert: {
          answer: string
          answered_at?: string
          id?: string
          is_correct: boolean
          player_id: string
          room_id: string
          round: number
        }
        Update: {
          answer?: string
          answered_at?: string
          id?: string
          is_correct?: boolean
          player_id?: string
          room_id?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_answers_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "room_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_answers_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_player_secrets: {
        Row: {
          player_id: string
          token: string
        }
        Insert: {
          player_id: string
          token?: string
        }
        Update: {
          player_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_player_secrets_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "room_players"
            referencedColumns: ["id"]
          },
        ]
      }
      room_players: {
        Row: {
          id: string
          is_host: boolean
          joined_at: string
          last_seen: string
          name: string
          room_id: string
          score: number
        }
        Insert: {
          id?: string
          is_host?: boolean
          joined_at?: string
          last_seen?: string
          name: string
          room_id: string
          score?: number
        }
        Update: {
          id?: string
          is_host?: boolean
          joined_at?: string
          last_seen?: string
          name?: string
          room_id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_rounds: {
        Row: {
          author: string
          body: string
          choices: Json | null
          claim: string | null
          claim_is_true: boolean | null
          message_id: string
          room_id: string
          round: number
        }
        Insert: {
          author: string
          body: string
          choices?: Json | null
          claim?: string | null
          claim_is_true?: boolean | null
          message_id: string
          room_id: string
          round: number
        }
        Update: {
          author?: string
          body?: string
          choices?: Json | null
          claim?: string | null
          claim_is_true?: boolean | null
          message_id?: string
          room_id?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "room_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          chat_label: string
          code: string
          created_at: string
          current_round: number
          id: string
          mode: string
          reveal_at: string | null
          round_choices: Json | null
          round_claim: string | null
          round_message_author: string | null
          round_message_body: string | null
          round_message_id: string | null
          round_phase: string
          status: string
          total_rounds: number
        }
        Insert: {
          chat_label?: string
          code: string
          created_at?: string
          current_round?: number
          id?: string
          mode: string
          reveal_at?: string | null
          round_choices?: Json | null
          round_claim?: string | null
          round_message_author?: string | null
          round_message_body?: string | null
          round_message_id?: string | null
          round_phase?: string
          status?: string
          total_rounds?: number
        }
        Update: {
          chat_label?: string
          code?: string
          created_at?: string
          current_round?: number
          id?: string
          mode?: string
          reveal_at?: string | null
          round_choices?: Json | null
          round_claim?: string | null
          round_message_author?: string | null
          round_message_body?: string | null
          round_message_id?: string | null
          round_phase?: string
          status?: string
          total_rounds?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      advance_room: { Args: { p_room_id: string }; Returns: undefined }
      create_room: {
        Args: {
          p_chat_label: string
          p_host_name: string
          p_mode: string
          p_rounds: Json
          p_total_rounds: number
        }
        Returns: {
          code: string
          player_id: string
          room_id: string
          token: string
        }[]
      }
      gen_room_code: { Args: never; Returns: string }
      heartbeat: {
        Args: { p_player_id: string; p_token: string }
        Returns: undefined
      }
      join_room: {
        Args: { p_code: string; p_name: string }
        Returns: {
          player_id: string
          room_id: string
          token: string
        }[]
      }
      reconcile_room: { Args: { p_room_id: string }; Returns: undefined }
      start_room: {
        Args: { p_player_id: string; p_room_id: string; p_token: string }
        Returns: undefined
      }
      submit_answer: {
        Args: {
          p_answer: string
          p_player_id: string
          p_room_id: string
          p_round: number
          p_token: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const