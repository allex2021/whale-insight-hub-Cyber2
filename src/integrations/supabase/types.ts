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
      ai_signals: {
        Row: {
          asset: string
          confidence: number
          created_at: string
          direction: string
          entry: number | null
          evidence: Json | null
          id: string
          model: string
          reasoning: string | null
          stop: number | null
          target: number | null
          timeframe: string
        }
        Insert: {
          asset: string
          confidence: number
          created_at?: string
          direction: string
          entry?: number | null
          evidence?: Json | null
          id?: string
          model?: string
          reasoning?: string | null
          stop?: number | null
          target?: number | null
          timeframe?: string
        }
        Update: {
          asset?: string
          confidence?: number
          created_at?: string
          direction?: string
          entry?: number | null
          evidence?: Json | null
          id?: string
          model?: string
          reasoning?: string | null
          stop?: number | null
          target?: number | null
          timeframe?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          alert_type: string
          asset: string | null
          created_at: string
          id: string
          message: string
          payload: Json | null
          severity: string
          user_id: string
        }
        Insert: {
          alert_type: string
          asset?: string | null
          created_at?: string
          id?: string
          message: string
          payload?: Json | null
          severity?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          asset?: string | null
          created_at?: string
          id?: string
          message?: string
          payload?: Json | null
          severity?: string
          user_id?: string
        }
        Relationships: []
      }
      broadcast_channels: {
        Row: {
          bot_token: string | null
          channel_type: string
          chat_id: string | null
          created_at: string
          created_by: string | null
          enabled: boolean
          filter_assets: string[] | null
          filter_sides: string[] | null
          id: string
          min_confidence: number
          name: string
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          bot_token?: string | null
          channel_type: string
          chat_id?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          filter_assets?: string[] | null
          filter_sides?: string[] | null
          id?: string
          min_confidence?: number
          name: string
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          bot_token?: string | null
          channel_type?: string
          chat_id?: string | null
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          filter_assets?: string[] | null
          filter_sides?: string[] | null
          id?: string
          min_confidence?: number
          name?: string
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      broadcast_signals: {
        Row: {
          channel_id: string | null
          created_at: string
          error: string | null
          id: string
          sent_at: string | null
          signal_id: string | null
          status: string
        }
        Insert: {
          channel_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          signal_id?: string | null
          status?: string
        }
        Update: {
          channel_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          signal_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_signals_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "broadcast_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_signals_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "ai_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          enable_alerts: boolean
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
          watchlist: string[]
          whale_min_usd: number
        }
        Insert: {
          enable_alerts?: boolean
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
          watchlist?: string[]
          whale_min_usd?: number
        }
        Update: {
          enable_alerts?: boolean
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
          watchlist?: string[]
          whale_min_usd?: number
        }
        Relationships: []
      }
      whale_trades: {
        Row: {
          asset: string
          created_at: string
          exchange: string
          id: string
          price: number
          quantity: number
          side: string
          size_usd: number
          trade_time: string
        }
        Insert: {
          asset: string
          created_at?: string
          exchange?: string
          id?: string
          price: number
          quantity: number
          side: string
          size_usd: number
          trade_time?: string
        }
        Update: {
          asset?: string
          created_at?: string
          exchange?: string
          id?: string
          price?: number
          quantity?: number
          side?: string
          size_usd?: number
          trade_time?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
