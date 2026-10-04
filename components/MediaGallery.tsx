import { FEATURED_MEDIA, facebookVideoEmbed } from "@/lib/featuredMedia";

export function MediaGallery() {
  return (
    <div className="grid w-full gap-6 md:grid-cols-3">
      {FEATURED_MEDIA.map((item) => (
        <figure key={item.id} id={item.id} className="comic-panel overflow-hidden bg-black p-2">
          {item.videoUrl ? (
            <iframe
              title={item.alt}
              src={facebookVideoEmbed(item.videoUrl)}
              className="aspect-[9/16] w-full"
              allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <img
              src={item.image}
              alt={item.alt}
              referrerPolicy="no-referrer"
              className="mx-auto max-h-[70vh] w-full object-contain"
            />
          )}
        </figure>
      ))}
    </div>
  );
}
