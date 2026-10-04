export type PanelStatus =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'failure'; readonly message: string }
