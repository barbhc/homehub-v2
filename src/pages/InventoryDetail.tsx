import { useParams, Navigate } from "react-router-dom"

export default function InventoryDetail() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/items/${id ?? ""}`} replace />
}
