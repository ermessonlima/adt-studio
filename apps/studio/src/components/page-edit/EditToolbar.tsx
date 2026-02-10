import { Pencil, Save, X, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EditToolbarProps {
  isEditing: boolean
  hasChanges: boolean
  isSaving: boolean
  isReRendering: boolean
  hasApiKey: boolean
  hasRenderingData: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onReRender: () => void
}

export function EditToolbar({
  isEditing,
  hasChanges,
  isSaving,
  isReRendering,
  hasApiKey,
  hasRenderingData,
  onEdit,
  onSave,
  onCancel,
  onReRender,
}: EditToolbarProps) {
  if (!isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onEdit} disabled={!hasRenderingData}>
          <Pencil className="mr-1 h-3 w-3" />
          Edit Inputs
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onReRender}
          disabled={!hasApiKey || isReRendering || !hasRenderingData}
        >
          {isReRendering ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-3 w-3" />
          )}
          Re-render Page
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        onClick={onSave}
        disabled={!hasChanges || isSaving}
      >
        {isSaving ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Save className="mr-1 h-3 w-3" />
        )}
        Save Changes
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
        <X className="mr-1 h-3 w-3" />
        Cancel
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onReRender}
        disabled={!hasApiKey || isReRendering || hasChanges}
        title={hasChanges ? "Save changes before re-rendering" : ""}
      >
        {isReRendering ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <RefreshCw className="mr-1 h-3 w-3" />
        )}
        Re-render Page
      </Button>
    </div>
  )
}
