export function PosterInstallNote() {
  return (
    <p className="border-4 border-black bg-[#FFF7D1] p-3 font-comic text-sm">
      DealFinder Poster is not running in this Chrome profile. Open <strong>chrome://extensions</strong>, turn on
      Developer mode, choose <strong>Load unpacked</strong>, and select the <strong>extension</strong> folder from this
      project. In the extension options, connect Supabase and the personal profile you post from.
    </p>
  );
}
