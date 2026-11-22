import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardHeader } from '../components/ui/Card';
import { GlobalHeatmap } from '../components/gaze/GlobalHeatmap';

/** Research-wide mean heatmap across every session and all stimulus images. */
export function GlobalHeatmapPage() {
  return (
    <div>
      <PageHeader
        eyebrow="تحلیل جمعی"
        title="نقشه حرارتی کلی"
        subtitle="میانگین توزیع نگاه در تمام جلسات و تمام تصاویر (۹ محرک)"
      />
      <Card>
        <CardHeader
          title="میانگین تمام محرکها"
          subtitle="تجمیع نقطههای نگاه معتبر با نرمالسازی بر اساس اندازه صفحه هر جلسه"
        />
        <GlobalHeatmap />
      </Card>
    </div>
  );
}
