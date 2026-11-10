import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { api, type QuoteParams } from './client';

const CATALOG = { staleTime: Infinity, gcTime: Infinity } as const;

export const useWorlds = () => useQuery({ queryKey: ['worlds'], queryFn: api.worlds, ...CATALOG });
export const useRegions = () => useQuery({ queryKey: ['regions'], queryFn: api.regions, ...CATALOG });
export const useCompanies = () => useQuery({ queryKey: ['companies'], queryFn: api.companies, ...CATALOG });
export const useWorldDetail = (id: string | null) =>
  useQuery({ queryKey: ['world', id], queryFn: () => api.world(id ?? ''), enabled: id !== null, ...CATALOG });

export const useQuote = (params: QuoteParams | null) =>
  useQuery({
    queryKey: ['quote', params],
    queryFn: () => api.quote(params as QuoteParams),
    enabled: params !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useInquiry = () => useMutation({ mutationFn: api.inquire });
