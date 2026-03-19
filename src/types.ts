export interface ProductImages {
  front: string | null;
  side: string | null;
  back: string | null;
  kibble: string | null;
}

export interface ProductDimensions {
  length: string;
  width: string;
  thickness: string;
  kibbleTraits: string;
}

export interface WorkflowState {
  step: number;
  images: ProductImages;
  dimensions: ProductDimensions;
  productType: 'cat' | 'dog' | 'other';
  customProductType: string;
  extractedInfo: string;
  characterCardDesc: string;
  characterCardImage: string | null;
  imageError: string | null;
  adCopy: string;
  adCopyOptions: string[];
  adStyle: string;
  adDuration: string;
  customStyle: string;
  storyboardPrompt: string;
  storyboardImage: string | null;
}

export const INITIAL_STATE: WorkflowState = {
  step: 1,
  images: { front: null, side: null, back: null, kibble: null },
  dimensions: { length: '', width: '', thickness: '', kibbleTraits: '' },
  productType: 'dog',
  customProductType: '',
  extractedInfo: '',
  characterCardDesc: '',
  characterCardImage: null,
  imageError: null,
  adCopy: '',
  adCopyOptions: [],
  adStyle: 'minimal',
  adDuration: '15s',
  customStyle: '',
  storyboardPrompt: '',
  storyboardImage: null,
};
