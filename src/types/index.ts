export interface Category {
  name: string;
  slug: string;
  color: string; // hex color e.g. "#6366f1"
}

export interface Author {
  name: string;
  avatar?: string;
  bio?: string;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: Category;
  author: Author;
  publishedAt: string;
  readTime: number;
  imageUrl?: string;
  featured?: boolean;
  breaking?: boolean;
  tags: string[];
  views?: number;
  aiCommentary?: string;
}

export type AdminStatus = 'pending' | 'approved' | 'rejected';

export interface AdminArticle extends Article {
  status: AdminStatus;
  aiGenerated: boolean;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  aiPrompt?: string;
}
