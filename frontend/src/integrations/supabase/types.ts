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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      catalog_edit_requests: {
        Row: {
          catalog_record_id: string
          citation_references: string | null
          color: string
          created_at: string
          date_range: string
          description: string | null
          dimensions: string | null
          id: string
          image_url: string | null
          manuscript: string | null
          name: string
          rarity: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          state: string
          status: string
          town: string
          type: string
          valuation: string | null
        }
        Insert: {
          catalog_record_id: string
          citation_references?: string | null
          color: string
          created_at?: string
          date_range: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          manuscript?: string | null
          name: string
          rarity?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          state: string
          status?: string
          town: string
          type: string
          valuation?: string | null
        }
        Update: {
          catalog_record_id?: string
          citation_references?: string | null
          color?: string
          created_at?: string
          date_range?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          manuscript?: string | null
          name?: string
          rarity?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string
          status?: string
          town?: string
          type?: string
          valuation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_edit_requests_catalog_record_id_fkey"
            columns: ["catalog_record_id"]
            isOneToOne: false
            referencedRelation: "catalog_records"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_records: {
        Row: {
          citation_references: string | null
          color: string
          created_at: string
          date_range: string
          description: string | null
          dimensions: string | null
          id: string
          image_url: string | null
          manuscript: string | null
          name: string
          rarity: string | null
          state: string
          submitted_by: string | null
          town: string
          type: string
          updated_at: string
          valuation: string | null
        }
        Insert: {
          citation_references?: string | null
          color: string
          created_at?: string
          date_range: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          manuscript?: string | null
          name: string
          rarity?: string | null
          state: string
          submitted_by?: string | null
          town: string
          type: string
          updated_at?: string
          valuation?: string | null
        }
        Update: {
          citation_references?: string | null
          color?: string
          created_at?: string
          date_range?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          manuscript?: string | null
          name?: string
          rarity?: string | null
          state?: string
          submitted_by?: string | null
          town?: string
          type?: string
          updated_at?: string
          valuation?: string | null
        }
        Relationships: []
      }
      login_requests: {
        Row: {
          comments: string | null
          country: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          organization: string | null
          phone_number: string | null
          salutation: string | null
          status: string
        }
        Insert: {
          comments?: string | null
          country: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          organization?: string | null
          phone_number?: string | null
          salutation?: string | null
          status?: string
        }
        Update: {
          comments?: string | null
          country?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          organization?: string | null
          phone_number?: string | null
          salutation?: string | null
          status?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          citation_references: string | null
          color: string
          created_at: string
          date_range: string
          description: string | null
          dimensions: string | null
          id: string
          image_url: string | null
          manuscript: string | null
          name: string
          rarity: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string
          status: string
          submitter_name: string | null
          town: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          citation_references?: string | null
          color: string
          created_at?: string
          date_range: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          manuscript?: string | null
          name: string
          rarity?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state: string
          status?: string
          submitter_name?: string | null
          town: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          citation_references?: string | null
          color?: string
          created_at?: string
          date_range?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          image_url?: string | null
          manuscript?: string | null
          name?: string
          rarity?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string
          status?: string
          submitter_name?: string | null
          town?: string
          type?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_catalog_edit_request: {
        Args: { p_admin_uid?: string; p_request_id: string }
        Returns: Json
      }
      catalog_record_has_approved_submission: {
        Args: {
          p_date_range: string
          p_name: string
          p_state: string
          p_town: string
          p_type: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_users_for_admin: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "contributor" | "viewer"
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
      app_role: ["admin", "contributor", "viewer"],
    },
  },
} as const
