import {
  focusManager,
  QueryClient,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { tipcClient } from "./tipc-client"
import type { AnyModel, DownloadProgress } from "@shared/index"

focusManager.setEventListener((handleFocus) => {
  const handler = () => handleFocus()
  window.addEventListener("focus", handler)
  return () => {
    window.removeEventListener("focus", handler)
  }
})

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: "always",
    },
  },
})

export const useMicrphoneStatusQuery = () =>
  useQuery({
    queryKey: ["microphone-status"],
    queryFn: async () => {
      return tipcClient.getMicrophoneStatus()
    },
  })

export const useConfigQuery = () => useQuery({
  queryKey: ["config"],
  queryFn: async () => {
    return tipcClient.getConfig()
  },
})

export const useSaveConfigMutation = () => useMutation({
  mutationFn: tipcClient.saveConfig,
  onSuccess() {
    queryClient.invalidateQueries({
      queryKey: ["config"],
    })
  },
})

export const useModelsQuery = () =>
  useQuery<AnyModel[]>({
    queryKey: ["models"],
    queryFn: async () => {
      return tipcClient.listModels()
    },
    refetchInterval: 5000,
  })

export const useDownloadModelMutation = () =>
  useMutation({
    mutationFn: (input: { modelId: string }) => tipcClient.downloadModel(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
  })

export const useDeleteModelMutation = () =>
  useMutation({
    mutationFn: (input: { modelId: string }) => tipcClient.deleteModel(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
  })

export const useSetDefaultLocalModelMutation = () =>
  useMutation({
    mutationFn: (input: { modelId: string }) =>
      tipcClient.setDefaultLocalModel(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["config"] })
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
  })

export const useModelDownloadProgressQuery = (
  modelId?: string,
  options?: { enabled?: boolean; refetchInterval?: number },
) =>
  useQuery<DownloadProgress | null>({
    queryKey: ["model-download-progress", modelId],
    enabled: Boolean(modelId) && (options?.enabled ?? true),
    queryFn: async () => {
      if (!modelId) return null
      return tipcClient.getModelDownloadProgress({ modelId })
    },
    refetchInterval: options?.refetchInterval ?? 800,
  })

export const useImportModelMutation = () =>
  useMutation({
    mutationFn: (input: { filePath: string }) => tipcClient.importLocalModel(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
  })

export const useAddCustomModelMutation = () =>
  useMutation({
    mutationFn: (input: {
      displayName: string
      description: string
      endpoint: string
      modelIdentifier: string
      language: "english" | "multilingual"
      requiresApiKey: boolean
    }) => tipcClient.addCustomModel(input),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ["models"] })
    },
  })

export const useRevealModelMutation = () =>
  useMutation({
    mutationFn: (input: { filePath: string }) =>
      tipcClient.revealModelInFolder(input),
  })
