import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, FileText, Trash2, Eye, Plus, Loader2, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';


interface ProductKnowledge {
  id: string;
  name: string;
  insurer: string | null;
  summary: string | null;
  full_content: string | null;
  source_file_url: string | null;
  is_active: boolean;
  extraction_status: string;
  created_at: string;
  updated_at: string;
}

const ProductKnowledgeSettings: React.FC = () => {
  const [products, setProducts] = useState<ProductKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewProduct, setViewProduct] = useState<ProductKnowledge | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', insurer: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const fetchProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from('product_knowledge')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      toast.error('Erro ao carregar produtos');
    } else {
      setProducts((data as any[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const handleUpload = async () => {
    if (!selectedFile || !newProduct.name) {
      toast.error('Preencha o nome e selecione um arquivo PDF');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload PDF to storage
      const fileName = `product-docs/${Date.now()}-${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(fileName, selectedFile, { contentType: 'application/pdf' });

      if (uploadError) throw uploadError;

      // 2. Create product_knowledge record
      const { data: product, error: insertError } = await supabase
        .from('product_knowledge')
        .insert({
          name: newProduct.name,
          insurer: newProduct.insurer || null,
          source_file_url: fileName,
          extraction_status: 'pending',
        } as any)
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success('PDF enviado! Extraindo conteúdo...');
      setShowAddDialog(false);
      setNewProduct({ name: '', insurer: '' });
      setSelectedFile(null);

      // 3. Trigger extraction
      const { error: extractError } = await supabase.functions.invoke('extract-product-text', {
        body: { productId: (product as any).id, fileUrl: fileName },
      });

      if (extractError) {
        console.error('Extraction error:', extractError);
        toast.error('Erro ao extrair texto do PDF. Tente reprocessar.');
      } else {
        toast.success('Texto extraído com sucesso!');
      }

      fetchProducts();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Erro: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleReprocess = async (product: ProductKnowledge) => {
    if (!product.source_file_url) {
      toast.error('Arquivo fonte não encontrado');
      return;
    }

    toast.info('Reprocessando PDF...');
    
    const { error } = await supabase.functions.invoke('extract-product-text', {
      body: { productId: product.id, fileUrl: product.source_file_url },
    });

    if (error) {
      toast.error('Erro ao reprocessar');
    } else {
      toast.success('Reprocessamento iniciado!');
      setTimeout(fetchProducts, 3000);
    }
  };

  const handleToggleActive = async (product: ProductKnowledge) => {
    const { error } = await supabase
      .from('product_knowledge')
      .update({ is_active: !product.is_active } as any)
      .eq('id', product.id);

    if (error) {
      toast.error('Erro ao atualizar');
    } else {
      fetchProducts();
    }
  };

  const handleDelete = async (product: ProductKnowledge) => {
    if (!confirm(`Tem certeza que deseja excluir "${product.name}"?`)) return;

    // Delete from storage if exists
    if (product.source_file_url) {
      await supabase.storage.from('whatsapp-media').remove([product.source_file_url]);
    }

    const { error } = await supabase
      .from('product_knowledge')
      .delete()
      .eq('id', product.id);

    if (error) {
      toast.error('Erro ao excluir');
    } else {
      toast.success('Produto excluído');
      fetchProducts();
    }
  };

  const handleUpdateContent = async (product: ProductKnowledge, fullContent: string) => {
    const { error } = await supabase
      .from('product_knowledge')
      .update({ full_content: fullContent } as any)
      .eq('id', product.id);

    if (error) {
      toast.error('Erro ao salvar alterações');
    } else {
      toast.success('Conteúdo atualizado');
      setViewProduct(null);
      fetchProducts();
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-emerald-600 gap-1"><CheckCircle className="w-3 h-3" /> Extraído</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processando</Badge>;
      case 'error':
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" /> Erro</Badge>;
      default:
        return <Badge variant="outline" className="gap-1">Pendente</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Base de Conhecimento de Produtos</CardTitle>
            <CardDescription>
              Upload de PDFs das condições gerais para o agente usar como referência nas conversas.
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button variant="default" size="sm" className="gap-2">
                <Plus className="w-4 h-4" /> Adicionar Produto
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Condições Gerais</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>Nome do Produto *</Label>
                  <Input
                    placeholder="Ex: Órbita Plus"
                    value={newProduct.name}
                    onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Arquivo PDF *</Label>
                  <Input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    O texto será extraído automaticamente via IA após o upload.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleUpload} disabled={uploading || !selectedFile || !newProduct.name}>
                  {uploading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Enviando...</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" /> Enviar e Extrair</>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum produto cadastrado.</p>
              <p className="text-sm">Adicione PDFs das condições gerais para o agente consultar.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Conteúdo</TableHead>
                  <TableHead>Ativo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map(product => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.insurer || '-'}</TableCell>
                    <TableCell>{statusBadge(product.extraction_status)}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {product.full_content
                        ? `${(product.full_content.length / 1000).toFixed(1)}k caracteres`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={product.is_active}
                        onCheckedChange={() => handleToggleActive(product)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {product.full_content && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewProduct(product)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        )}
                        {(product.extraction_status === 'error' || product.extraction_status === 'pending' || product.extraction_status === 'processing') && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReprocess(product)}
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View/Edit Content Dialog */}
      <Dialog open={!!viewProduct} onOpenChange={(open) => !open && setViewProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{viewProduct?.name} - Conteúdo Extraído</DialogTitle>
          </DialogHeader>
          {viewProduct && (
            <div className="space-y-4">
              {viewProduct.summary && (
                <div>
                  <Label className="text-sm font-medium">Resumo</Label>
                  <p className="text-sm text-muted-foreground mt-1">{viewProduct.summary}</p>
                </div>
              )}
              <div>
                <Label className="text-sm font-medium">Conteúdo Completo (editável)</Label>
                <Textarea
                  className="mt-1 min-h-[400px] font-mono text-xs"
                  defaultValue={viewProduct.full_content || ''}
                  onChange={(e) => {
                    if (viewProduct) {
                      viewProduct.full_content = e.target.value;
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setViewProduct(null)}
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => handleUpdateContent(viewProduct, viewProduct.full_content || '')}
                >
                  Salvar Alterações
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductKnowledgeSettings;
