export interface SuggestionCatalogItem {
  tmdbId: number;
  title: string;
  year: number;
  normalizedTitle: string;
  popularity: number;
  originalTitle?: string;
}
