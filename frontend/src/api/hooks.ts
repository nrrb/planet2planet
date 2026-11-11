import { useMutation, useQuery } from '@tanstack/react-query';
import { api, type QuoteParams } from './client';

const CATALOG = { staleTime: Infinity, gcTime: Infinity } as const;

export const useWorlds = () => useQuery({ queryKey: ['worlds'], queryFn: api.worlds, ...CATALOG });
export const useNetwork = () => useQuery({ queryKey: ['network'], queryFn: api.network, ...CATALOG });
export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: api.meta, ...CATALOG });
export const useHistory = () => useQuery({ queryKey: ['history'], queryFn: api.history, ...CATALOG });
export const useCanonFacts = (category?: string) =>
  useQuery({ queryKey: ['canon-facts', category], queryFn: () => api.canonFacts(category), ...CATALOG });
export const useSimulation = () => useQuery({ queryKey: ['simulation'], queryFn: api.simulation, ...CATALOG });
export const useWorldStatistics = (metric: string, world?: string) =>
  useQuery({
    queryKey: ['world-statistics', metric, world],
    queryFn: () => api.worldStatistics(metric, world),
    ...CATALOG,
  });
export const useRegions = () => useQuery({ queryKey: ['regions'], queryFn: api.regions, ...CATALOG });
export const useCompanies = () => useQuery({ queryKey: ['companies'], queryFn: api.companies, ...CATALOG });
export const useWorldDetail = (id: string | null) =>
  useQuery({ queryKey: ['world', id], queryFn: () => api.world(id ?? ''), enabled: id !== null, ...CATALOG });

/**
 * Plans for a pair of worlds. While only the filters change, the last result stays on screen; a
 * different pair shows loading instead, so one pair's plans are never labelled as another's.
 */
export const useQuote = (params: QuoteParams | null) =>
  useQuery({
    queryKey: ['quote', params],
    queryFn: () => api.quote(params as QuoteParams),
    enabled: params !== null,
    placeholderData: (previous, previousQuery) => {
      const before = previousQuery?.queryKey[1] as QuoteParams | null | undefined;
      return before && params && before.from === params.from && before.to === params.to ? previous : undefined;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

export const useInquiry = () => useMutation({ mutationFn: api.inquire });
